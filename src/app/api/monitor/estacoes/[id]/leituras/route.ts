import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  estacoesPluviometricasRepository,
  leiturasPluviometricasRepository,
} from '@/infrastructure/repositories';
import { sibhClient } from '@/infrastructure/sibh/sibh-client';
import { obterLeiturasComFallback } from '@/application/use-cases/monitor/obter-leituras-com-fallback';
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
// Teto defensivo da janela. Acima disso a série diária fica grande demais para
// uma resposta única do painel de detalhe (~400 dias cobre mais de um ano).
const MAX_DIAS_JANELA = 400;
const DIAS_PADRAO = 30;

// Param de rota: id da estação como uuid.
const paramsSchema = z.object({
  id: z.string().uuid(),
});

// Query do período. desde/ate opcionais no formato YYYY-MM-DD; default cobre os
// ultimos 30 dias. Datas interpretadas em UTC (início do dia) para casar com a
// granularidade diária da série. Intervalo invertido ou maior que o teto cai
// como query invalida.
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
 * GET /api/monitor/estacoes/[id]/leituras
 *
 * Devolve a série de leituras diárias de uma estação pluviométrica num período,
 * para o painel de detalhe do Monitor (fase B3). Exige sessão.
 *
 * Query: ?desde=YYYY-MM-DD&ate=YYYY-MM-DD (ambos opcionais; default = últimos 30
 * dias, ate = hoje). Intervalo invertido ou maior que 400 dias retorna 400.
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

    // Lê do banco e, se vazio com estação consultável, busca do SIBH sob
    // demanda, persiste e relê (fallback lazy). Mantém a arquitetura de
    // persistência e faz o painel funcionar como o original (que lê ao vivo). O
    // use-case é tolerante: SIBH indisponível não estoura — devolve o que houver
    // no banco e sinaliza no resultado.
    const { leituras, origemFallbackSibh, fallbackFalhou } =
      await obterLeiturasComFallback(
        sibhClient,
        leiturasPluviometricasRepository,
        { id: estacaoId, prefixo: estacao.prefixo },
        desde,
        ate,
        (evento) =>
          logger.info(
            'monitor.leituras.fallback_sibh',
            {
              usuarioId: usuario.id,
              estacaoId,
              medicoesRecebidas: evento.medicoesRecebidas,
              linhasGravadas: evento.linhasGravadas,
              erros: evento.erros,
              desde: desde.toISOString(),
              ate: ate.toISOString(),
            },
            'Fallback de leituras ao SIBH executado sob demanda',
          ),
      );

    if (fallbackFalhou) {
      logger.warn(
        'monitor.leituras.fallback_sibh_falhou',
        { usuarioId: usuario.id, estacaoId },
        'Fallback de leituras ao SIBH falhou; retornando o que houver no banco',
      );
    }

    const itens = leituras.map((l) => ({
      momento: l.momento.toISOString(),
      automaticoMm: l.automaticoMm,
      manualMm: l.manualMm,
    }));

    logger.info(
      'monitor.leituras.listadas',
      {
        usuarioId: usuario.id,
        estacaoId,
        total: itens.length,
        origemFallbackSibh,
        desde: desde.toISOString(),
        ate: ate.toISOString(),
      },
      'Leituras pluviométricas do Monitor listadas',
    );

    return NextResponse.json(
      {
        estacao: {
          id: estacao.id,
          prefixo: estacao.prefixo,
          nome: estacao.nome,
          bacia: estacao.bacia,
          tipo: estacao.tipo,
          postoId: estacao.postoId,
        },
        itens,
      },
      { status: 200, headers },
    );
  } catch (e) {
    return respostaDeErro(
      'GET /api/monitor/estacoes/[id]/leituras',
      { usuarioId: usuario.id, estacaoId },
      e,
    );
  }
}
