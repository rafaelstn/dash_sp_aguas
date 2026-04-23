import type { FavoritosRepository } from '@/application/ports/favoritos-repository';

export interface EntradaAlternarFavorito {
  usuarioId: string;
  prefixo: string;
}

export interface ResultadoAlternarFavorito {
  favoritado: boolean;
}

/**
 * Alterna favorito. Exige usuário autenticado (usuarioId não nulo).
 * Se não autenticado, erro explícito — a camada de API já filtra, mas o
 * use case garante o invariante.
 */
export async function alternarFavorito(
  repo: FavoritosRepository,
  entrada: EntradaAlternarFavorito,
): Promise<ResultadoAlternarFavorito> {
  if (!entrada.usuarioId || entrada.usuarioId.trim() === '') {
    throw new Error('usuario nao autenticado');
  }
  if (!entrada.prefixo || entrada.prefixo.trim() === '') {
    throw new Error('prefixo invalido');
  }
  const favoritado = await repo.alternar(entrada.usuarioId, entrada.prefixo);
  return { favoritado };
}
