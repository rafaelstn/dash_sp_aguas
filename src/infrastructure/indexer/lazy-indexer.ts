import 'server-only';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { statSync } from 'node:fs';
import { sql } from '@/infrastructure/db/client';

/**
 * Infra de lazy indexing (ADR-0006). Expõe 3 operações:
 *
 *   checarCache(prefixo)          -> 'fresh' | 'stale' | 'miss'
 *   tentarLock(prefixo, cb)       -> advisory lock transacional + callback
 *   dispararWorker(prefixo, opts) -> spawna `python -m ops.indexer.indexar_posto`
 *
 * O endpoint GET /api/postos/{prefixo} combina as três para servir ficha
 * com garantia de índice fresco — mas com budget de latência (deadline_s=8),
 * devolvendo 202 + jobId se estourar.
 */

export type StatusCache = 'fresh' | 'stale' | 'miss';

const TIMEOUT_SYNC_MS = 8_000;
const PYTHON_BIN = process.env.PYTHON_BIN ?? 'python';

/**
 * Advisory lock por prefixo. `pg_try_advisory_xact_lock` sai sozinho no
 * COMMIT/ROLLBACK. Chave = hashtext(prefixo) convertido pra int8 — o
 * Postgres tem overload `(bigint)` estável, ao contrário do `(int, int)`.
 *
 * hashtext retorna int4; fazemos cast explícito pra bigint no SQL.
 */
export async function tentarLock<T>(
  prefixo: string,
  cb: () => Promise<T>,
): Promise<{ sucesso: true; resultado: T } | { sucesso: false }> {
  return await sql.begin(async (tx) => {
    const rows = await tx<{ ok: boolean }[]>`
      SELECT pg_try_advisory_xact_lock(hashtext(${prefixo})::bigint) AS ok
    `;
    if (!rows[0]?.ok) {
      return { sucesso: false as const };
    }
    const resultado = await cb();
    return { sucesso: true as const, resultado };
  });
}

export async function checarCache(prefixo: string): Promise<StatusCache> {
  const rows = await sql<{
    status: string;
    fresh: boolean;
    indexado_em: Date;
    caminho: string | null;
  }[]>`
    SELECT c.status,
           (c.expira_em > NOW()) AS fresh,
           c.indexado_em,
           cam.caminho_unc AS caminho
      FROM posto_indexacao_cache c
      LEFT JOIN postos_caminhos cam ON cam.prefixo = c.prefixo AND cam.ativo = true
     WHERE c.prefixo = ${prefixo}
  `;
  const linha = rows[0];
  if (!linha) return 'miss';
  if (!linha.fresh || linha.status !== 'ok') return 'stale';

  // Mesmo com TTL válido, valida mtime da pasta UNC para detectar arquivos
  // novos/alterados desde a última indexação. Custa ~50ms em SMB por request,
  // mas garante UX "sempre atualizado com o HD" sem depender de TTL.
  if (linha.caminho) {
    try {
      const st = statSync(linha.caminho);
      if (st.mtimeMs > linha.indexado_em.getTime()) return 'stale';
    } catch {
      return 'stale';
    }
  }
  return 'fresh';
}

export interface ResultadoWorker {
  prefixo: string;
  status: 'ok' | 'pasta_inexistente' | 'sem_permissao' | 'timeout' | 'cache_hit' | 'erro';
  arquivos_indexados: number;
  arquivos_orfaos: number;
  duracao_s: number;
}

/**
 * Dispara o worker Python em subprocesso. Se `timeoutMs` expirar, mata o
 * processo e lança `WorkerTimeoutError` — o caller deve responder 202 +
 * continuar o job em background (spawnear novamente com timeout maior).
 */
export async function dispararWorkerSync(
  prefixo: string,
  opts: { forcar?: boolean; timeoutMs?: number } = {},
): Promise<ResultadoWorker> {
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_SYNC_MS;
  const args = ['-m', 'ops.indexer.indexar_posto', '--prefixo', prefixo,
                '--deadline', String(Math.floor(timeoutMs / 1000))];
  if (opts.forcar) args.push('--forcar');

  return await new Promise<ResultadoWorker>((resolve, reject) => {
    const proc = spawn(PYTHON_BIN, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (c: Buffer) => { stdout += c.toString('utf8'); });
    proc.stderr.on('data', (c: Buffer) => { stderr += c.toString('utf8'); });

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      reject(new WorkerTimeoutError(prefixo));
    }, timeoutMs);

    proc.on('close', (code) => {
      clearTimeout(timer);
      try {
        const parsed = JSON.parse(stdout) as ResultadoWorker;
        resolve(parsed);
      } catch {
        reject(new Error(
          `worker falhou (exit ${code}): ${stderr.slice(-500) || stdout.slice(-500)}`,
        ));
      }
    });
    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/**
 * Dispara o worker em background sem esperar. Retorna um jobId (uuid derivado)
 * imediatamente. Usado quando o síncrono estoura o budget de 8s.
 */
export function dispararWorkerBackground(
  prefixo: string,
  opts: { forcar?: boolean } = {},
): string {
  const args = ['-m', 'ops.indexer.indexar_posto', '--prefixo', prefixo,
                '--deadline', '120'];
  if (opts.forcar) args.push('--forcar');

  const proc = spawn(PYTHON_BIN, args, {
    stdio: 'ignore',
    detached: true,
    env: process.env,
  });
  proc.unref();

  return createHash('sha1').update(`${prefixo}:${Date.now()}`).digest('hex').slice(0, 16);
}

export class WorkerTimeoutError extends Error {
  constructor(public readonly prefixo: string) {
    super(`Indexação de ${prefixo} estourou budget síncrono`);
    this.name = 'WorkerTimeoutError';
  }
}
