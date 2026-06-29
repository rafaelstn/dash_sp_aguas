import type { Papel } from '@/domain/auth/papel';

/**
 * Repositório de papéis (RBAC: super_admin | admin | user).
 *
 * Fonte de verdade: coluna `usuarios_papeis.papel` (migration 0050). A flag
 * `aprovador` legada é derivada (admin/super_admin == aprovador).
 */
export interface PapeisRepository {
  /**
   * Papel do usuário. Retorna 'user' quando não há linha em `usuarios_papeis`
   * (default seguro: menor privilégio).
   */
  obterPapel(usuarioId: string): Promise<Papel>;

  /** True se o usuário é aprovador (admin ou super_admin). Deriva de `papel`. */
  ehAprovador(usuarioId: string): Promise<boolean>;
}
