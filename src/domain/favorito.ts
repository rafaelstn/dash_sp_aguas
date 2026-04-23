/**
 * Favorito — registro de que um usuário autenticado marcou um posto como tal.
 * ADR-0005. `usuarioId` é UUID do Supabase Auth; `prefixo` é a chave lógica
 * do posto (consistente com o resto do domínio).
 */
export interface Favorito {
  usuarioId: string;
  prefixo: string;
  criadoEm: Date;
}
