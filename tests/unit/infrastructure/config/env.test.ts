import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Testes do guard de boot do env (André/Segurança).
 *
 * `getEnv` cacheia o resultado em módulo singleton e lê `process.env` direto.
 * Para isolar cada cenário, resetamos os módulos antes de cada teste e
 * importamos `getEnv` dinamicamente, garantindo cache limpo + env stubada.
 */

const BASE_PROD = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://u:p@h:5432/db',
  NEXT_PUBLIC_SUPABASE_URL: 'https://proj.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
} as const;

function stubAll(vars: Record<string, string>): void {
  for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v);
}

async function carregarEnv() {
  vi.resetModules();
  const mod = await import('@/infrastructure/config/env');
  return mod.getEnv;
}

beforeEach(() => {
  // Limpa heranças do setup global (ex.: CRON_SECRET) que não afetam aqui,
  // mas garante que cada teste controle só o que precisa.
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('env/guard wildcard de allowlist em produção', () => {
  it("lança erro fail-fast se AUTH_ALLOWED_EMAIL_DOMAINS='*' em produção", async () => {
    stubAll({ ...BASE_PROD, AUTH_ALLOWED_EMAIL_DOMAINS: '*' });
    const getEnv = await carregarEnv();
    expect(() => getEnv()).toThrow(/AUTH_ALLOWED_EMAIL_DOMAINS.*\*.*produção/s);
  });

  it("lança erro se '*' aparece junto de outros domínios em produção", async () => {
    stubAll({ ...BASE_PROD, AUTH_ALLOWED_EMAIL_DOMAINS: 'sp.gov.br, *' });
    const getEnv = await carregarEnv();
    expect(() => getEnv()).toThrow(/AUTH_ALLOWED_EMAIL_DOMAINS/);
  });

  it('NÃO bloqueia wildcard fora de produção (modo demo/avaliação)', async () => {
    stubAll({
      NODE_ENV: 'development',
      DATABASE_URL: '',
      AUTH_ALLOWED_EMAIL_DOMAINS: '*',
    });
    const getEnv = await carregarEnv();
    expect(() => getEnv()).not.toThrow();
    expect(getEnv().AUTH_ALLOWED_EMAIL_DOMAINS).toBe('*');
  });

  it('aceita produção com lista de domínios institucionais reais', async () => {
    stubAll({
      ...BASE_PROD,
      AUTH_ALLOWED_EMAIL_DOMAINS: 'sp.gov.br,daee.sp.gov.br',
    });
    const getEnv = await carregarEnv();
    expect(() => getEnv()).not.toThrow();
    expect(getEnv().AUTH_ALLOWED_EMAIL_DOMAINS).toBe('sp.gov.br,daee.sp.gov.br');
  });
});
