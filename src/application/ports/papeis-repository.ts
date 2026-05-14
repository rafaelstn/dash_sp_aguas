/**
 * Repositório de papéis (RBAC mínimo).
 *
 * Implementação Postgres consulta `usuarios_papeis` (migration 0023,
 * trigger MFA removido pela migration 0027 e ADR-0010).
 */
export interface PapeisRepository {
  /** True se o usuário tem flag `aprovador = TRUE` em `usuarios_papeis`. */
  ehAprovador(usuarioId: string): Promise<boolean>;
}
