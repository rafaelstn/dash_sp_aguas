import 'server-only';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { stat } from 'node:fs/promises';
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

// Teto pro stat() de pasta UNC: em HD de rede sob SMB lento a chamada pode
// pendurar o event loop. Acima disso tratamos como 'stale' e deixamos o worker
// revalidar — nunca bloqueamos o request.
const STAT_TIMEOUT_MS = 300;

// Grace entre SIGTERM e SIGKILL no subprocesso Python. Se o worker não sair
// com o term, força o kill pra não deixar processo órfão.
const KILL_GRACE_MS = 2_000;

/**
 * Allowlist de variáveis de ambiente repassadas ao subprocesso do indexer.
 * Em vez de vazar todo `process.env` (que carrega secrets de outros serviços),
 * passamos só o que o worker Python precisa: credencial do banco do indexer,
 * raiz da varredura e o mínimo do SO (PATH/SystemRoot) + encoding do JSON.
 */
function envIndexer(): NodeJS.ProcessEnv {
  const CHAVES = [
    'DATABASE_URL_INDEXER',
    'DATABASE_URL',
    'INDEXER_ROOT_PATH',
    'PYTHON_BIN',
    'PYTHONPATH',
    'PYTHONIOENCODING',
    'PATH',
    'Path',
    'SystemRoot',
    'SYSTEMROOT',
    'TEMP',
    'TMP',
    // NODE_ENV não é usado pelo worker Python, mas a tipagem de ProcessEnv
    // do projeto o exige; repassamos o do processo.
    'NODE_ENV',
  ] as const;
  const env: Record<string, string> = { PYTHONIOENCODING: 'utf-8' };
  for (const chave of CHAVES) {
    const valor = process.env[chave];
    if (valor !== undefined) env[chave] = valor;
  }
  return env as NodeJS.ProcessEnv;
}

/**
 * stat() com teto de latência. Resolve `null` no timeout (ou erro de I/O),
 * deixando o caller decidir o fallback sem nunca pendurar o event loop.
 */
async function statComTimeout(
  caminho: string,
  timeoutMs: number,
): Promise<{ mtimeMs: number } | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  try {
    return await Promise.race([
      stat(caminho).then((st) => ({ mtimeMs: st.mtimeMs })),
      limite,
    ]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

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
  // novos/alterados desde a última indexação. Antes era statSync (bloqueava o
  // event loop ~50ms, pior sob SMB lento). Agora é stat assíncrono com teto de
  // latência: no timeout/erro tratamos como 'stale' e deixamos o worker
  // revalidar, sem nunca pendurar o request.
  if (linha.caminho) {
    const st = await statComTimeout(linha.caminho, STAT_TIMEOUT_MS);
    if (!st) return 'stale';
    if (st.mtimeMs > linha.indexado_em.getTime()) return 'stale';
  }
  return 'fresh';
}

export interface ResultadoWorker {
  prefixo: string;
  status:
    | 'ok'
    | 'parcial'
    | 'pasta_inexistente'
    | 'sem_permissao'
    | 'timeout'
    | 'cache_hit'
    | 'erro';
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
      env: envIndexer(),
    });

    let stdout = '';
    let stderr = '';
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    proc.stdout.on('data', (c: Buffer) => { stdout += c.toString('utf8'); });
    proc.stderr.on('data', (c: Buffer) => { stderr += c.toString('utf8'); });

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      // Se o term não derrubar o worker dentro do grace, força SIGKILL pra
      // não deixar processo órfão segurando a conexão do banco.
      killTimer = setTimeout(() => {
        if (!proc.killed) proc.kill('SIGKILL');
      }, KILL_GRACE_MS);
      killTimer.unref?.();
      reject(new WorkerTimeoutError(prefixo));
    }, timeoutMs);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
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
      if (killTimer) clearTimeout(killTimer);
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
    env: envIndexer(),
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
