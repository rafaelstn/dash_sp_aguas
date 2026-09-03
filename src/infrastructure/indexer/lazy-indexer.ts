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
      // Interpretador ausente é ambiente, não falha do indexador. Sem esta
      // distinção o `ENOENT` sobe pelo mesmo caminho de um erro real e derruba
      // a ficha inteira do posto. Ver `IndexadorIndisponivelError`.
      reject(ehIndexadorAusente(err) ? new IndexadorIndisponivelError(prefixo, err) : err);
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

/**
 * O indexador não existe NESTE ambiente, o que é diferente de ele ter falhado.
 *
 * A imagem de produção é `node:24-alpine`: não tem Python e não carrega a pasta
 * `ops/`, então `spawn('python')` devolve `ENOENT`. Isso está registrado como
 * pendência de escopo na seção 9.3 do runbook `entrega-imagem-sem-internet.md`,
 * e continua em aberto se o indexador vira um quarto serviço, roda como tarefa
 * do host, ou sai desta entrega.
 *
 * Enquanto a decisão não vem, o que NÃO pode acontecer é uma funcionalidade
 * acessória derrubar a principal. Sem este erro tipado, o `ENOENT` subia pelo
 * mesmo caminho de uma falha real e **a ficha inteira do posto respondia HTTP
 * 500**. Medido em produção em 03/09/2026, com `Error: spawn python ENOENT` no
 * log: o defeito estava lá desde a subida e não aparecia porque o banco estava
 * vazio e não havia ficha para abrir.
 *
 * Distinguir os dois casos é o ponto: ausência do ambiente degrada com aviso e
 * a ficha é servida sem a varredura de arquivos; falha real do indexador
 * continua subindo como erro.
 */
export class IndexadorIndisponivelError extends Error {
  constructor(
    public readonly prefixo: string,
    public readonly causa: unknown,
  ) {
    super(
      `Indexador indisponível neste ambiente (${PYTHON_BIN} não encontrado). ` +
        `A ficha de ${prefixo} é servida sem a varredura de arquivos.`,
    );
    this.name = 'IndexadorIndisponivelError';
  }
}

/**
 * `true` quando o erro é o interpretador ausente, e não uma falha do indexador.
 * `ENOENT` de `spawn` é o sinal do sistema operacional para "programa não
 * existe", e é exatamente o que acontece numa imagem sem Python. `EACCES` cobre
 * o caso vizinho, em que o arquivo existe e não é executável.
 */
export function ehIndexadorAusente(erro: unknown): boolean {
  const codigo = (erro as { code?: unknown } | null)?.code;
  return codigo === 'ENOENT' || codigo === 'EACCES';
}
