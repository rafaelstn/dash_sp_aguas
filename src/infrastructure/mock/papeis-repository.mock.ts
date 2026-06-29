import type { PapeisRepository } from '@/application/ports/papeis-repository';
import { type Papel, ehAdmin, ehPapelValido } from '@/domain/auth/papel';

/**
 * Mock do RBAC pra dev local sem Supabase Auth real.
 *
 * Configurável via env var:
 *   DEV_PAPEL_USUARIO  Papel atribuído ao usuário do bypass dev
 *                      (super_admin | admin | user). Default: 'super_admin'
 *                      (dev permissivo, vê tudo). Aceita também o legado
 *                      DEV_APROVADOR_USUARIO_ID (se igual ao id, vira admin).
 *
 * Em modo demo (sem DB) ou em teste local com DEV_BYPASS_AUTH_EMAIL,
 * Fernanda pode trabalhar sem Supabase rodando.
 */
function papelDeDev(usuarioId: string): Papel {
  const env = process.env.DEV_PAPEL_USUARIO;
  if (ehPapelValido(env)) return env;
  const aprovador = process.env.DEV_APROVADOR_USUARIO_ID;
  if (aprovador) return aprovador === usuarioId ? 'admin' : 'user';
  return 'super_admin'; // dev permissivo
}

export const papeisRepository: PapeisRepository = {
  async obterPapel(usuarioId) {
    return papelDeDev(usuarioId);
  },

  async ehAprovador(usuarioId) {
    return ehAdmin(papelDeDev(usuarioId));
  },
};
