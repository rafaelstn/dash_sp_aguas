import 'server-only';

import { criarClienteSupabaseServer } from './supabase-server';

export interface UsuarioAutenticado {
  id: string;
  email: string;
}

/**
 * Lê o usuário atual a partir do cookie de sessão (server-side).
 * Retorna `null` se não houver sessão válida ou se auth estiver desabilitada.
 */
export async function obterUsuarioAtual(): Promise<UsuarioAutenticado | null> {
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
