/**
 * Repositório de papéis (RBAC mínimo) + checagem de MFA.
 *
 * Implementação Postgres consulta `usuarios_papeis` (migration 0023) e
 * `auth.mfa_factors` (Supabase Auth).
 */
export interface PapeisRepository {
  /** True se o usuário tem flag `aprovador = TRUE` em `usuarios_papeis`. */
  ehAprovador(usuarioId: string): Promise<boolean>;

  /** True se o usuário tem ao menos um fator MFA verificado. */
  temMFAVerificado(usuarioId: string): Promise<boolean>;
}
