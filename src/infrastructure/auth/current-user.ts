import 'server-only';

import { criarClienteSupabaseServer } from './supabase-server';
import { obterUsuarioBypassDev } from './dev-bypass';

export interface UsuarioAutenticado {
  id: string;
  email: string;
}

/**
 * Lê o usuário atual a partir do cookie de sessão (server-side).
 * Retorna `null` se não houver sessão válida ou se auth estiver desabilitada.
 *
 * Em dev com DEV_BYPASS_AUTH_EMAIL setada, retorna usuário mockado sem
 * consultar Supabase — ver infrastructure/auth/dev-bypass.ts.
 */
export async function obterUsuarioAtual(): Promise<UsuarioAutenticado | null> {
  const bypass = obterUsuarioBypassDev();
  if (bypass) return bypass;

  try {
    const supabase = await criarClienteSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !user.email) return null;
    return { id: user.id, email: user.email };
  } catch {
    return null;
  }
}
