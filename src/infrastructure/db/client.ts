import 'server-only';
import postgres, { type Sql } from 'postgres';
import { getEnv } from '@/infrastructure/config/env';

/**
 * Singleton do cliente postgres.js com conexão PREGUIÇOSA.
 *
 * Em modo demo (DATABASE_URL vazia) o módulo pode ser importado sem efeito
 * colateral — nenhuma conexão é aberta e nenhuma variável é validada até que
 * alguém efetivamente execute uma query. Isso permite que os repositórios
 * `.pg.ts` coexistam com os mocks no mesmo bundle sem quebrar o boot.
 */
declare global {
  // eslint-disable-next-line no-var
  var __pg_singleton__: Sql | undefined;
}

function criar(): Sql {
  const env = getEnv();
  if (env.isDemoMode) {
    throw new Error(
      'Tentativa de abrir conexão PostgreSQL em modo demo. ' +
        'Verifique DATABASE_URL em .env.local ou use os repositórios mock.',
    );
  }
  return postgres(env.DATABASE_URL, {
    // Conexão enxuta: 5 conexões bastam para o MVP; Supabase pooler cuida do resto.
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false, // Supabase pooler em modo transaction não suporta prepared statements.
    transform: {
      undefined: null,
    },
  });
}

function obter(): Sql {
  if (globalThis.__pg_singleton__) return globalThis.__pg_singleton__;
  const instancia = criar();
  if (process.env.NODE_ENV !== 'production') {
    globalThis.__pg_singleton__ = instancia;
  }
  return instancia;
}

/**
 * Proxy que atrasa a criação do cliente até o primeiro uso. Aplicar
 * `sql`...`` ou `sql(...)` ou `sql.unsafe(...)` dispara `obter()`.
 *
 * Necessário porque o `postgres.js` expõe `sql` como função + objeto com
 * métodos (unsafe, begin, end, etc.). O Proxy preserva as duas faces.
 */
export const sql = new Proxy(function () {} as unknown as Sql, {
  apply(_alvo, thisArg, args: unknown[]) {
    // `sql` é chamável como template tag e como função normal
    const real = obter() as unknown as (...a: unknown[]) => unknown;
    return Reflect.apply(real, thisArg, args);
  },
  get(_alvo, prop) {
    const real = obter() as unknown as Record<PropertyKey, unknown>;
    const valor = real[prop];
    if (typeof valor === 'function') {
      return (valor as (...a: unknown[]) => unknown).bind(real);
    }
    return valor;
  },
}) as Sql;
