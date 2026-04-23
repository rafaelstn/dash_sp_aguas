import { z } from 'zod';

/**
 * Validação das variáveis de ambiente usadas pelo servidor (API Routes).
 * Falha rápida em boot se alguma estiver inválida.
 *
 * DATABASE_URL é opcional: quando vazia/ausente, o app entra em MODO DEMO
 * (fixtures em memória). Modo demo é bloqueado em produção.
 */
const schema = z.object({
  DATABASE_URL: z.string().optional().default(''),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Supabase Auth (desvio autorizado da US-008 para Fase 1 — ver ADR-0004)
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  // Domínios permitidos pra magic link, separados por vírgula.
  AUTH_ALLOWED_EMAIL_DOMAINS: z
    .string()
    .default('sp.gov.br,daee.sp.gov.br,rafaeldamasceno.dev'),
  // Emails individuais fora da allowlist de domínios (ex.: consultor). CSV.
  AUTH_EXTRA_ALLOWED_EMAILS: z.string().optional().default(''),
});

export type Env = z.infer<typeof schema> & {
  isDemoMode: boolean;
  isAuthEnabled: boolean;
};

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const detalhe = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Variáveis de ambiente inválidas:\n${detalhe}`);
  }
  const data = parsed.data;
  const isDemoMode = !data.DATABASE_URL || data.DATABASE_URL.trim() === '';
  const isAuthEnabled = Boolean(
    data.NEXT_PUBLIC_SUPABASE_URL && data.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  if (isDemoMode && data.NODE_ENV === 'production') {
    throw new Error(
      'DATABASE_URL é obrigatória em produção. Modo demo só funciona em development/test.',
    );
  }
  if (!isAuthEnabled && data.NODE_ENV === 'production') {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY são obrigatórias em produção (ver ADR-0004).',
    );
  }

  cached = { ...data, isDemoMode, isAuthEnabled };
  return cached;
}
