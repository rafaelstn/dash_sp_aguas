/**
 * Guard do singleton do cliente postgres.js (incidente de 19/08/2026).
 *
 * O que ele protege: em produção, `obter()` precisa reusar UM único cliente.
 * Sem isso, cada toque no Proxy `sql` (cada acesso de propriedade e cada
 * execução de query) instanciava um `postgres()` novo, com `max: 5` e sem
 * `.end()`. Medido antes da correção: 5 clientes por requisição simulada e 15
 * em três requisições, em production, contra 1 em development. Como cada query
 * saía de um cliente recém-criado, cada uma abria conexão nova que só fechava
 * por `idle_timeout` (20 s), contra um pooler que aceita 15 sessões.
 *
 * O módulo `postgres` é instrumentado por um contador: nenhuma conexão é
 * aberta e a DATABASE_URL é sintética. Este arquivo não toca banco nenhum.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

let contador = 0;
const criados: unknown[] = [];

vi.mock('postgres', () => {
  const fabrica = () => {
    contador += 1;
    const sqlFalso = Object.assign(
      function tag() {
        return { rows: [] };
      },
      {
        unsafe: () => ({ rows: [] }),
        begin: async () => undefined,
        end: async () => undefined,
        options: { max: 5 },
      },
    );
    criados.push(sqlFalso);
    return sqlFalso;
  };
  return { default: fabrica };
});

const BASE = {
  DATABASE_URL: 'postgres://guard:guard@127.0.0.1:1/guard',
  NEXT_PUBLIC_SUPABASE_URL: 'https://guard.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-sintetica-para-guard',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  AUTH_ALLOWED_EMAIL_DOMAINS: 'sp.gov.br',
} as const;

function stubAll(vars: Record<string, string>): void {
  for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v);
}

/** Uma requisição típica: os repositórios `.pg.ts` tocam o Proxy várias vezes. */
async function umaRequisicao(sql: Record<string, unknown>): Promise<void> {
  const chamavel = sql as unknown as (...a: unknown[]) => unknown;
  chamavel(['select 1']); // template tag -> trap apply
  (sql.unsafe as (...a: unknown[]) => unknown)('select 2'); // trap get + chamada
  chamavel(['select 3']);
  void sql.options; // trap get em propriedade não-função
  await (sql.begin as (...a: unknown[]) => Promise<unknown>)(async () => undefined);
}

async function carregarModulo(
  nodeEnv: 'production' | 'development',
  databaseUrl: string = BASE.DATABASE_URL,
) {
  vi.resetModules();
  vi.unstubAllEnvs();
  delete globalThis.__pg_singleton__;
  stubAll({ ...BASE, DATABASE_URL: databaseUrl, NODE_ENV: nodeEnv });
  contador = 0;
  criados.length = 0;
  return import('@/infrastructure/db/client');
}

afterEach(() => {
  vi.unstubAllEnvs();
  delete globalThis.__pg_singleton__;
});

describe('cliente postgres.js: singleton', () => {
  it('em production reusa UM cliente em várias requisições', async () => {
    const { sql } = await carregarModulo('production');
    const alvo = sql as unknown as Record<string, unknown>;

    await umaRequisicao(alvo);
    await umaRequisicao(alvo);
    await umaRequisicao(alvo);

    expect(contador).toBe(1);
    expect(new Set(criados).size).toBe(1);
  });

  it('em development reusa UM cliente (comportamento já existente)', async () => {
    const { sql } = await carregarModulo('development');
    const alvo = sql as unknown as Record<string, unknown>;

    await umaRequisicao(alvo);
    await umaRequisicao(alvo);

    expect(contador).toBe(1);
  });

  it('production e development criam a MESMA quantidade de clientes', async () => {
    const { sql: sqlProd } = await carregarModulo('production');
    await umaRequisicao(sqlProd as unknown as Record<string, unknown>);
    const emProducao = contador;

    const { sql: sqlDev } = await carregarModulo('development');
    await umaRequisicao(sqlDev as unknown as Record<string, unknown>);
    const emDesenvolvimento = contador;

    expect(emProducao).toBe(emDesenvolvimento);
  });

  it('importar o módulo não abre cliente nenhum (boot preguiçoso)', async () => {
    await carregarModulo('production');
    expect(contador).toBe(0);
  });

  it('modo demo: import sem DATABASE_URL não cria cliente e a query avisa', async () => {
    const { sql } = await carregarModulo('development', '');
    expect(contador).toBe(0);

    const chamavel = sql as unknown as () => unknown;
    expect(() => chamavel()).toThrow(/modo demo/i);
    expect(contador).toBe(0);
    // Falha ao criar não pode deixar singleton envenenado no globalThis.
    expect(globalThis.__pg_singleton__).toBeUndefined();
  });
});
