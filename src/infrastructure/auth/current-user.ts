import 'server-only';

import { criarClienteSupabaseServer } from './supabase-server';
import { obterUsuarioBypassDev } from './dev-bypass';

export interface UsuarioAutenticado {
  id: string;
  email: string;
  /**
   * Nome de exibição. Vem de `user_metadata.nome` quando o usuário se
   * cadastra via /cadastrar. Pode ser null pra usuários antigos criados
   * via painel Supabase sem metadata. Quem consome deve fazer fallback
   * pro `email` (parte antes do @) quando ausente.
   */
  nome: string | null;
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
  if (bypass) {
    return { id: bypass.id, email: bypass.email, nome: null };
  }

  try {
    const supabase = await criarClienteSupabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !user.email) return null;
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const nomeBruto = typeof meta.nome === 'string' ? meta.nome.trim() : '';
    return {
      id: user.id,
      email: user.email,
      nome: nomeBruto.length > 0 ? nomeBruto : null,
    };
  } catch {
    return null;
  }
}
