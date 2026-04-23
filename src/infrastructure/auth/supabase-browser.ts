'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * Cliente Supabase para componentes client-side (p.ex. form de login).
 *
 * Usa ANON_KEY, que é segura para o browser. NUNCA referencia service_role.
 * A persistência da sessão é feita via cookies gerenciados pelo pacote @supabase/ssr.
 */
export function criarClienteSupabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error(
      'Supabase Auth não configurado: defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    );
  }
  return createBrowserClient(url, anon);
}
