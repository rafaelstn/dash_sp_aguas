import type { PapeisRepository } from '@/application/ports/papeis-repository';

/**
 * Mock do RBAC pra dev local sem Supabase Auth real.
 *
 * Configurável via env var:
 *   DEV_APROVADOR_USUARIO_ID  UUID do usuário tratado como aprovador.
 *                             Default: aceita qualquer um.
 *
 * Em modo demo (sem DB) ou em teste local com DEV_BYPASS_AUTH_EMAIL,
 * Fernanda pode trabalhar sem Supabase rodando.
 */
function lerEnv(name: string): string | undefined {
  return process.env[name];
}

export const papeisRepository: PapeisRepository = {
  async ehAprovador(usuarioId) {
    const restricao = lerEnv('DEV_APROVADOR_USUARIO_ID');
    if (!restricao) return true; // dev permissivo
    return restricao === usuarioId;
  },
};
