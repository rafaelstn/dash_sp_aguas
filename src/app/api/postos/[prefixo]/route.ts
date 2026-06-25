import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { obterFicha } from '@/application/use-cases/obter-ficha';
import {
  postosRepository,
  auditoriaRepository,
  papeisRepository,
} from '@/infrastructure/repositories';
import {
  PostoNaoEncontrado,
  PostoRemovido,
} from '@/domain/errors';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import { logger } from '@/infrastructure/logging/logger';
import { respostaDeErro } from '@/app/api/_helpers/erros';
import type { RespostaErro, RespostaFicha } from '@/types/dto';
import {
  checarCache,
  dispararWorkerBackground,
  dispararWorkerSync,
  tentarLock,
  WorkerTimeoutError,
} from '@/infrastructure/indexer/lazy-indexer';
import {
  POLITICAS,
  aplicarHeadersRateLimit,
  consumirRateLimit,
  extrairIp,
} from '@/infrastructure/security/rate-limit';

// Lazy indexing é read-heavy em HD de rede; o runtime Node é obrigatório
// pra permitir `spawn` do worker Python.
export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ prefixo: string }> },
) {
  const { prefixo: prefixoRaw } = await ctx.params;
  const prefixo = decodeURIComponent(prefixoRaw);

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    null;
  const userAgent = request.headers.get('user-agent');
  const usuario = await obterUsuarioAtual();

  // --- Lazy indexing (ADR-0006) -------------------------------------------
  // 1) Cache fresh: serve direto.
  // 2) Stale/miss: tenta disparar o worker síncrono com timeout 8s.
  //    Se estourar, spawna em background e resposta vira 202.
  //    Se outra requisição já está reindexando (lock ocupado), serve stale
  //    ou 202 — nunca bloqueia esperando.
  // -----------------------------------------------------------------------
  try {
    const status = await checarCache(prefixo);

    if (status !== 'fresh') {
      const lock = await tentarLock(prefixo, async () => {
        try {
          return await dispararWorkerSync(prefixo, { timeoutMs: 8_000 });
        } catch (e) {
          if (e instanceof WorkerTimeoutError) {
            const jobId = dispararWorkerBackground(prefixo);
            return { tipo: 'timeout' as const, jobId };
          }
          throw e;
        }
      });

      // Lock ocupado: alguém já está reindexando. Serve o que tiver.
      // Se status era 'miss', devolve 202 pra frontend mostrar loader.
      if (!lock.sucesso && status === 'miss') {
        const body: RespostaErro = {
          erro: {
            codigo: 'INDEXACAO_EM_CURSO',
            mensagem: 'Primeira indexação deste posto em andamento. Tente em instantes.',
          },
        };
        return NextResponse.json(body, { status: 202 });
      }

      // Timeout síncrono: devolve 202 com jobId.
      if (lock.sucesso && 'tipo' in lock.resultado && lock.resultado.tipo === 'timeout') {
        const body: RespostaErro = {
          erro: {
            codigo: 'INDEXACAO_PENDENTE',
            mensagem: `Indexação do posto ${prefixo} iniciada em segundo plano.`,
          },
        };
        return NextResponse.json(
          { ...body, job_id: lock.resultado.jobId },
          { status: 202 },
        );
      }
    }

    const posto = await obterFicha(postosRepository, auditoriaRepository, {
      prefixo,
      ip,
      userAgent,
      usuarioId: usuario?.id ?? null,
    });
    const body: RespostaFicha = posto;
    return NextResponse.json(body);
  } catch (e) {
    if (e instanceof PostoNaoEncontrado) {
      const body: RespostaErro = {
        erro: { codigo: 'POSTO_NAO_ENCONTRADO', mensagem: e.message },
      };
      return NextResponse.json(body, { status: 404 });
    }
    const correlationId = randomUUID();
    logger.error(
      'erro_inesperado',
      { correlationId, rota: 'GET /api/postos/[prefixo]', prefixo, erro: String(e) },
      'Falha ao obter ficha do posto',
    );
    const body: RespostaErro = {
      erro: {
        codigo: 'ERRO_INTERNO',
        mensagem: 'Falha ao obter ficha do posto.',
        correlationId,
      },
    };
    return NextResponse.json(body, { status: 500 });
  }
}

/**
 * POST /api/postos/{prefixo}/reindexar — força nova varredura ignorando cache.
 *
 * Usada quando o técnico sabe que o HD mudou e quer ver o estado atual.
 * Mesmo budget síncrono de 8s; se estourar, retorna 202 + job_id.
 */
export async function POST(
  _request: NextRequest,
  ctx: { params: Promise<{ prefixo: string }> },
) {
  const { prefixo: prefixoRaw } = await ctx.params;
  const prefixo = decodeURIComponent(prefixoRaw);

  try {
    const lock = await tentarLock(prefixo, async () => {
      try {
        return await dispararWorkerSync(prefixo, {
          forcar: true,
          timeoutMs: 8_000,
        });
      } catch (e) {
        if (e instanceof WorkerTimeoutError) {
          const jobId = dispararWorkerBackground(prefixo, { forcar: true });
          return { tipo: 'timeout' as const, jobId };
        }
        throw e;
      }
    });

    if (!lock.sucesso) {
      const body: RespostaErro = {
        erro: {
          codigo: 'INDEXACAO_EM_CURSO',
          mensagem: 'Reindexação já em andamento para este posto.',
        },
      };
      return NextResponse.json(body, { status: 409 });
    }

    const r = lock.resultado;
    if ('tipo' in r && r.tipo === 'timeout') {
      return NextResponse.json(
        {
          status: 'pendente',
          prefixo,
          job_id: r.jobId,
        },
        { status: 202 },
      );
    }

    // narrowing: aqui é ResultadoWorker (o branch 'tipo' já saiu).
    const worker = r as Extract<typeof r, { status: string }>;
    return NextResponse.json({
      status: worker.status,
      prefixo,
      arquivos_indexados: worker.arquivos_indexados,
      arquivos_orfaos: worker.arquivos_orfaos,
      duracao_s: worker.duracao_s,
    });
  } catch (e) {
    // NÃO expõe e.message no body, pode conter caminho de HD de rede
    // (Y:\...) ou stack do Postgres. Detalhe vai pros logs do servidor.
    const correlationId = randomUUID();
    logger.error(
      'erro_inesperado',
      { correlationId, rota: 'POST /api/postos/[prefixo] (reindexar)', prefixo, erro: String(e) },
      'Falha ao reindexar posto',
    );
    const body: RespostaErro = {
      erro: {
        codigo: 'ERRO_INTERNO',
        mensagem:
          'Falha ao reindexar este posto. Tente novamente em instantes ou contate o administrador.',
        correlationId,
      },
    };
    return NextResponse.json(body, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// PATCH /api/postos/[prefixo] — edição manual do cadastro do posto.
// Acesso restrito ao papel `aprovador`. Audit trail obrigatório em
// postos_evento. Validação Zod estrita.
// ─────────────────────────────────────────────────────────────────────────

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const camposEdicaoSchema = z.object({
  mantenedor: z.string().max(200).nullable().optional(),
  prefixoAna: z.string().max(40).nullable().optional(),
  nomeEstacao: z.string().max(200).nullable().optional(),
  operacaoInicioAno: z.number().int().min(1900).max(2100).nullable().optional(),
  operacaoFimAno: z.number().int().min(0).max(2100).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  municipio: z.string().max(120).nullable().optional(),
  municipioAlt: z.string().max(120).nullable().optional(),
  baciaHidrografica: z.string().max(120).nullable().optional(),
  ugrhiNome: z.string().max(120).nullable().optional(),
  ugrhiNumero: z.string().max(20).nullable().optional(),
  subUgrhiNome: z.string().max(120).nullable().optional(),
  subUgrhiNumero: z.string().max(20).nullable().optional(),
  rede: z.string().max(120).nullable().optional(),
  proprietario: z.string().max(120).nullable().optional(),
  tipoPosto: z.string().max(20).nullable().optional(),
  areaKm2: z.number().min(0).nullable().optional(),
  btl: z.string().max(120).nullable().optional(),
  ciaAmbiental: z.string().max(20).nullable().optional(),
  cobacia: z.string().max(40).nullable().optional(),
  observacoes: z.string().max(2000).nullable().optional(),
  altimetria: z.number().nullable().optional(),
  aquifero: z.string().max(120).nullable().optional(),
  anaEscalaInicio: isoDate.nullable().optional(),
  anaEscalaFim: isoDate.nullable().optional(),
  anaDescargaLiquidaInicio: isoDate.nullable().optional(),
  anaDescargaLiquidaFim: isoDate.nullable().optional(),
  anaSedimentosInicio: isoDate.nullable().optional(),
  anaSedimentosFim: isoDate.nullable().optional(),
  anaQualidadeInicio: isoDate.nullable().optional(),
  anaQualidadeFim: isoDate.nullable().optional(),
  anaPluviometroInicio: isoDate.nullable().optional(),
  anaPluviometroFim: isoDate.nullable().optional(),
  anaTelemetriaInicio: isoDate.nullable().optional(),
  anaTelemetriaFim: isoDate.nullable().optional(),
});

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ prefixo: string }> },
) {
  const usuario = await obterUsuarioAtual();
  if (!usuario) {
    return NextResponse.json({ erro: 'nao_autenticado' }, { status: 401 });
  }
  const ehAprovador = await papeisRepository.ehAprovador(usuario.id);
  if (!ehAprovador) {
    return NextResponse.json({ erro: 'sem_papel_aprovador' }, { status: 403 });
  }

  const rl = consumirRateLimit(POLITICAS.decisaoInventarioAna, usuario.id);
  const headers = new Headers();
  aplicarHeadersRateLimit(headers, POLITICAS.decisaoInventarioAna, rl);
  if (!rl.permitido) {
    return NextResponse.json(
      { erro: 'rate_limit' },
      { status: 429, headers },
    );
  }

  let bruto: unknown;
  try {
    bruto = await request.json();
  } catch {
    return NextResponse.json(
      { erro: 'json_invalido' },
      { status: 400, headers },
    );
  }

  const parsed = camposEdicaoSchema.safeParse(bruto);
  if (!parsed.success) {
    return NextResponse.json(
      {
        erro: 'body_invalido',
        motivos: parsed.error.issues.map(
          (i) => `${i.path.join('.')}: ${i.message}`,
        ),
      },
      { status: 400, headers },
    );
  }

  const { prefixo: prefixoRaw } = await ctx.params;
  const prefixo = decodeURIComponent(prefixoRaw);
  const ip = extrairIp(request);

  try {
    const posto = await postosRepository.atualizar(prefixo, parsed.data, {
      usuarioId: usuario.id,
      ip: ip === 'unknown' ? null : ip,
      userAgent: request.headers.get('user-agent'),
      origemEvento: 'ui_edicao',
      observacao: 'Edição manual via tela /postos/[prefixo]/editar',
    });
    return NextResponse.json({ posto }, { headers });
  } catch (e) {
    if (e instanceof PostoNaoEncontrado) {
      return NextResponse.json(
        { erro: 'nao_encontrado', mensagem: e.message },
        { status: 404, headers },
      );
    }
    if (e instanceof PostoRemovido) {
      return NextResponse.json(
        { erro: 'posto_removido', mensagem: e.message },
        { status: 409, headers },
      );
    }
    // Fallback 5xx centralizado; preserva os headers de rate-limit.
    const resposta = respostaDeErro(
      'PATCH /api/postos/[prefixo]',
      { prefixo, usuarioId: usuario.id },
      e,
    );
    headers.forEach((valor, chave) => resposta.headers.set(chave, valor));
    return resposta;
  }
}
