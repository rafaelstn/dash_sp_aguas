import 'server-only';

import { criarClienteSupabaseServer } from './supabase-server';
import { obterUsuarioBypassDev } from './dev-bypass';
import {
  acessoSemIdentidadeAtivo,
  USUARIO_SEM_IDENTIDADE,
} from './acesso-sem-identidade';

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
  // Janela sem identidade (entrega PRODESP, sem internet e sem API de login do
  // órgão). Vem antes de tudo porque neste modo não existe sessão para ler: a
  // atribuição é fixa e declarada. Ver acesso-sem-identidade.ts.
  if (acessoSemIdentidadeAtivo()) {
    return { ...USUARIO_SEM_IDENTIDADE };
  }

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
  } catch (e) {
    console.error('[auth] Falha ao obter usuário atual — tratando como deslogado', e);
    return null;
  }
}
