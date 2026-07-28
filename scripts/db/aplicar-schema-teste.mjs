/**
 * Aplica o schema completo (shim de auth + todas as migrations) num Postgres
 * DESCARTAVEL de teste, na ordem em que o deploy conteinerizado aplica.
 *
 * Uso:
 *   npm run db:test:up        # sobe o container na porta 55432
 *   npm run db:test:schema    # aplica o schema
 *   npm run test:integration  # roda os testes de integracao
 *   npm run db:test:down      # derruba o container
 *
 * Conexao: `TEST_DATABASE_URL` ou o default do `db:test:up`. Recusa rodar contra
 * host que nao seja local, para nunca aplicar schema em producao por engano.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const URL_PADRAO = 'postgresql://spaguas:teste@localhost:55432/spaguas_test';
const url = process.env.TEST_DATABASE_URL || URL_PADRAO;

const host = new URL(url).hostname;
if (!['localhost', '127.0.0.1', '::1'].includes(host)) {
  console.error(`Recusado: ${host} nao e local. Este script so aplica schema em banco de teste.`);
  process.exit(1);
}

const { default: postgres } = await import(
  pathToFileURL(path.join(RAIZ, 'node_modules', 'postgres', 'src', 'index.js')).href
);

// `onnotice` silencioso: reexecucao gera dezenas de "already exists, skipping",
// que sao esperados (as migrations sao idempotentes) e escondem o erro de verdade.
const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 15, onnotice: () => {} });

const arquivos = [
  path.join(RAIZ, 'db', 'auth-compat.sql'),
  ...readdirSync(path.join(RAIZ, 'supabase', 'migrations'))
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => path.join(RAIZ, 'supabase', 'migrations', f)),
];

try {
  for (const arquivo of arquivos) {
    const nome = path.basename(arquivo);
    try {
      await sql.unsafe(readFileSync(arquivo, 'utf8'));
    } catch (e) {
      console.error(`FALHOU em ${nome}: ${e.message}`);
      process.exit(1);
    }
  }
  console.log(`schema aplicado: ${arquivos.length} arquivos em ${host}`);
} finally {
  await sql.end({ timeout: 5 });
}
