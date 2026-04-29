import { NextResponse, type NextRequest } from 'next/server';
import { obterFicha } from '@/application/use-cases/obter-ficha';
import { postosRepository, auditoriaRepository } from '@/infrastructure/repositories';
import { PostoNaoEncontrado } from '@/domain/errors';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import type { RespostaErro, RespostaFicha } from '@/types/dto';
import {
  checarCache,
  dispararWorkerBackground,
  dispararWorkerSync,
  tentarLock,
  WorkerTimeoutError,
} from '@/infrastructure/indexer/lazy-indexer';

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
    const body: RespostaErro = {
      erro: { codigo: 'ERRO_INTERNO', mensagem: 'Falha ao obter ficha do posto.' },
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
    // NÃO expõe e.message no body — pode conter caminho de HD de rede
    // (Y:\...) ou stack do Postgres. Detalhe vai pros logs do servidor.
    console.error('[api/reindexar] Falha', {
      prefixo,
      mensagem: e instanceof Error ? e.message : String(e),
    });
    const body: RespostaErro = {
      erro: {
        codigo: 'ERRO_INTERNO',
        mensagem:
          'Falha ao reindexar este posto. Tente novamente em instantes ou contate o administrador.',
      },
    };
    return NextResponse.json(body, { status: 500 });
  }
}
