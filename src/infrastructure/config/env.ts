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
});

export type Env = z.infer<typeof schema> & { isDemoMode: boolean };

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

  if (isDemoMode && data.NODE_ENV === 'production') {
    throw new Error(
      'DATABASE_URL é obrigatória em produção. Modo demo só funciona em development/test.',
    );
  }

  cached = { ...data, isDemoMode };
  return cached;
}
