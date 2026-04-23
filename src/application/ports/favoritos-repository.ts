import type { Favorito } from '@/domain/favorito';

export interface FavoritosRepository {
  /**
   * Alterna o estado favoritado do posto. Retorna o estado resultante:
   *   - true  = agora está favoritado (inserido)
   *   - false = agora está desfavoritado (removido)
   * Idempotente.
   */
  alternar(usuarioId: string, prefixo: string): Promise<boolean>;

  /** Lista favoritos do usuário, mais recentes primeiro. */
  listar(usuarioId: string): Promise<Favorito[]>;

  /** Lista apenas os prefixos favoritos (para anotar em lista de resultados). */
  prefixosFavoritos(usuarioId: string): Promise<Set<string>>;

  /** Conta total de favoritos do usuário — usado em badge/contador. */
  contar(usuarioId: string): Promise<number>;
}
