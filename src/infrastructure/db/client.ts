import 'server-only';
import postgres from 'postgres';
import { getEnv } from '@/infrastructure/config/env';

/**
 * Singleton do cliente postgres.js.
 * Fica preservado entre invocações no mesmo processo (Next.js dev + prod).
 */
declare global {
  // eslint-disable-next-line no-var
  var __pg_singleton__: ReturnType<typeof postgres> | undefined;
}

function criar() {
  const env = getEnv();
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

export const sql = globalThis.__pg_singleton__ ?? criar();

if (process.env.NODE_ENV !== 'production') {
  globalThis.__pg_singleton__ = sql;
}
