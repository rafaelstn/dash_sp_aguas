import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { estacoesPluviometricasRepository } from '@/infrastructure/repositories';
import { sibhClient } from '@/infrastructure/sibh/sibh-client';
import { obterSerieNivel } from '@/application/use-cases/monitor/obter-serie-nivel';
import { exigirUsuario } from '@/app/api/_helpers/auth';
import { respostaDeErro } from '@/app/api/_helpers/erros';
import {
  POLITICAS,
  aplicarHeadersRateLimit,
  consumirRateLimit,
} from '@/infrastructure/security/rate-limit';
import { logger } from '@/infrastructure/logging/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MS_POR_DIA = 24 * 60 * 60 * 1000;
// Teto defensivo da janela, alinhado à rota irmã de leituras: a série de nível
// diária de mais de um ano numa resposta única já é grande demais.
const MAX_DIAS_JANELA = 400;
const DIAS_PADRAO = 30;

// Param de rota: id da estação como uuid.
const paramsSchema = z.object({
  id: z.string().uuid(),
});

// Query do período. Cópia do parsing da rota irmã `.../leituras/route.ts`:
// desde/ate opcionais no formato YYYY-MM-DD; default cobre os últimos 30 dias.
// Datas interpretadas em UTC (início do dia). Intervalo invertido ou maior que
// o teto cai como query inválida.
const querySchema = z
  .object({
    desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato YYYY-MM-DD.').optional(),
    ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato YYYY-MM-DD.').optional(),
  })
  .transform((valores, ctx) => {
    const agora = new Date();
    const hojeUtc = Date.UTC(
      agora.getUTCFullYear(),
      agora.getUTCMonth(),
      agora.getUTCDate(),
    );

    const interpretar = (texto: string, campo: 'desde' | 'ate'): number => {
      const ms = Date.parse(`${texto}T00:00:00.000Z`);
      if (Number.isNaN(ms)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [campo],
          message: 'Data inválida.',
        });
        return Number.NaN;
      }
      return ms;
    };

    const ateMs = valores.ate !== undefined ? interpretar(valores.ate, 'ate') : hojeUtc;
    const desdeMs =
      valores.desde !== undefined
        ? interpretar(valores.desde, 'desde')
        : (valores.ate !== undefined ? ateMs : hojeUtc) - DIAS_PADRAO * MS_POR_DIA;

    if (Number.isNaN(ateMs) || Number.isNaN(desdeMs)) {
      return z.NEVER;
    }

    if (desdeMs > ateMs) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['desde'],
        message: 'O início do período não pode ser posterior ao fim.',
      });
      return z.NEVER;
    }

    if (ateMs - desdeMs > MAX_DIAS_JANELA * MS_POR_DIA) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ate'],
        message: `O período não pode exceder ${MAX_DIAS_JANELA} dias.`,
      });
      return z.NEVER;
    }

    return { desde: new Date(desdeMs), ate: new Date(ateMs) };
  });

/**
 * GET /api/monitor/estacoes/[id]/nivel
 *
 * Devolve a série de nível (metros) diária de uma estação fluviométrica ou
 * piezométrica num período, agregada por dia de calendário (média/mín/máx).
 * Diferente de `/leituras` (chuva persistida), o nível é lido AO VIVO do SIBH e
 * NÃO é persistido. Exige sessão.
 *
 * Query: ?desde=YYYY-MM-DD&ate=YYYY-MM-DD (ambos opcionais; default = últimos 30
 * dias, ate = hoje). Intervalo invertido ou maior que 400 dias retorna 400.
 *
 * Estação pluviométrica retorna 409 (não tem nível; use /leituras para chuva).
 *
 * Resposta 200: { estacao, itens }, com itens ordenados por momento crescente.
 */
export async function GET(
  request: NextRequest,
  contexto: { params: Promise<{ id: string }> },
) {
  const auth = await exigirUsuario();
  if (auth instanceof NextResponse) return auth;
  const usuario = auth;

  const headers = new Headers();
  const rl = consumirRateLimit(POLITICAS.leituraMonitor, usuario.id);
  aplicarHeadersRateLimit(headers, POLITICAS.leituraMonitor, rl);
  if (!rl.permitido) {
    return NextResponse.json(
      { erro: 'rate_limit', mensagem: 'Muitas requisições. Tente em instantes.' },
      { status: 429, headers },
    );
  }

  const params = await contexto.params;
  const paramsParsed = paramsSchema.safeParse(params);
  if (!paramsParsed.success) {
    return NextResponse.json(
      { erro: 'id_invalido', mensagem: 'Identificador de estação inválido.' },
      { status: 400, headers },
    );
  }

  const queryParsed = querySchema.safeParse({
    desde: request.nextUrl.searchParams.get('desde') ?? undefined,
    ate: request.nextUrl.searchParams.get('ate') ?? undefined,
  });
  if (!queryParsed.success) {
    return NextResponse.json(
      {
        erro: 'query_invalida',
        mensagem: 'Parâmetros de período inválidos.',
        motivos: queryParsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      },
      { status: 400, headers },
    );
  }

  const estacaoId = paramsParsed.data.id;
  const { desde, ate } = queryParsed.data;

  try {
    const estacao = await estacoesPluviometricasRepository.obterPorId(estacaoId);
    if (!estacao) {
      return NextResponse.json(
        { erro: 'nao_encontrada', mensagem: 'Estação não encontrada.' },
        { status: 404, headers },
      );
    }

    // Estação pluviométrica não tem nível: rejeita explicando o caminho certo.
    // 409 (conflito com o estado do recurso) em vez de 400: o pedido é bem
    // formado, mas incompatível com o tipo desta estação.
    if (estacao.tipoEstacao === 'pluviometrico') {
      return NextResponse.json(
        {
          erro: 'tipo_incompativel',
          mensagem:
            'Esta estação é pluviométrica (mede chuva, não nível). Use /leituras para a série de chuva.',
        },
        { status: 409, headers },
      );
    }

    const { itens, sibhIndisponivel, semPrefixo } = await obterSerieNivel(
      sibhClient,
      { prefixo: estacao.prefixo },
      desde,
      ate,
      (erro) =>
        logger.warn(
          'monitor.nivel.sibh_indisponivel',
          {
            usuarioId: usuario.id,
            estacaoId,
            tipoEstacao: estacao.tipoEstacao,
            motivo: erro instanceof Error ? erro.message : String(erro),
          },
          'Consulta de nível ao SIBH falhou; retornando série vazia',
        ),
    );

    logger.info(
      'monitor.nivel.listado',
      {
        usuarioId: usuario.id,
        estacaoId,
        tipoEstacao: estacao.tipoEstacao,
        total: itens.length,
        sibhIndisponivel,
        semPrefixo,
        desde: desde.toISOString(),
        ate: ate.toISOString(),
      },
      'Série de nível do Monitor listada',
    );

    return NextResponse.json(
      {
        estacao: {
          id: estacao.id,
          prefixo: estacao.prefixo,
          nome: estacao.nome,
          tipoEstacao: estacao.tipoEstacao,
          bacia: estacao.bacia,
        },
        itens,
      },
      { status: 200, headers },
    );
  } catch (e) {
    return respostaDeErro(
      'GET /api/monitor/estacoes/[id]/nivel',
      { usuarioId: usuario.id, estacaoId },
      e,
    );
  }
}
