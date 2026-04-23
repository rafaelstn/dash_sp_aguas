import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getEnv } from '@/infrastructure/config/env';

/**
 * Cliente Supabase para Server Components, Server Actions e Route Handlers.
 *
 * Lê/escreve cookies via `next/headers`. Em Server Components puros a escrita
 * falha silenciosamente (não tem Response em execução) — o middleware cobre o
 * refresh do token nesse caso. Padrão documentado pelo Supabase (@supabase/ssr).
 */
export async function criarClienteSupabaseServer() {
  const env = getEnv();
  if (!env.isAuthEnabled) {
    throw new Error(
      'Supabase Auth não configurado: defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    );
  }

  const cookieStore = await cookies();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component não pode escrever cookies — o middleware refresha.
        }
      },
    },
  });
}
