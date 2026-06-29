import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getEnv } from '@/infrastructure/config/env';

/**
 * Cliente admin do Supabase com a SERVICE ROLE KEY.
 *
 * AVISO DE SEGURANÇA (governo): a service role ignora RLS e dá acesso total ao
 * projeto, inclusive ao Auth Admin (criar/remover usuários, trocar senha). Este
 * módulo é `server-only` — o `import 'server-only'` quebra o build se algum
 * código de cliente tentar importá-lo, garantindo que a chave nunca chegue ao
 * browser. Use apenas dentro de rotas/use-cases server-side.
 *
 * Padrão idêntico ao do Storage (`storage/foto-posto-storage.ts`): instância
 * preguiçosa em singleton, sem sessão persistida e sem auto-refresh (não há
 * usuário — é uma chave de serviço). Erro claro se faltar env.
 */

let clienteAdmin: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (clienteAdmin) return clienteAdmin;
  const env = getEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'Cliente admin indisponível: defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.',
    );
  }
  clienteAdmin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  return clienteAdmin;
}
