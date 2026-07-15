import type { IdentidadeUsuario } from '@/domain/estoque/export';

/**
 * Port de resolucao de IDENTIDADE de usuario (email/nome) a partir do id, em
 * LOTE (um unico SELECT com `WHERE id = ANY(...)`), para nao fazer N queries ao
 * montar uma trilha/export. Read-only.
 *
 * Adapter `.pg` le de `auth.users` (mesma fonte que a gestao de usuarios). O
 * UUID de sistema do import e ids ausentes em auth.users NAO entram no mapa; a
 * decisao de rotulo (ex.: "Importacao", fallback pro id cru) fica no dominio
 * (`rotuloOperador`), nao aqui. `.mock` devolve mapa vazio (sem Auth em demo).
 */
export interface UsuariosIdentidadeRepository {
  /** id -> identidade (email/nome) para os ids encontrados em auth.users. */
  resolver(ids: string[]): Promise<Map<string, IdentidadeUsuario>>;
}
