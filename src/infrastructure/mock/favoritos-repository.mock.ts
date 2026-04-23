import 'server-only';
import type { FavoritosRepository } from '@/application/ports/favoritos-repository';
import type { Favorito } from '@/domain/favorito';

/**
 * Adapter in-memory de FavoritosRepository (MODO DEMO).
 * Armazenamento por processo — perde dados ao reiniciar o servidor.
 */
const armazenamento = new Map<string, Favorito>();

function chave(usuarioId: string, prefixo: string): string {
  return `${usuarioId}|${prefixo}`;
}

export const favoritosRepository: FavoritosRepository = {
  async alternar(usuarioId, prefixo) {
    const k = chave(usuarioId, prefixo);
    if (armazenamento.has(k)) {
      armazenamento.delete(k);
      return false;
    }
    armazenamento.set(k, {
      usuarioId,
      prefixo,
      criadoEm: new Date(),
    });
    return true;
  },

  async listar(usuarioId) {
    return Array.from(armazenamento.values())
      .filter((f) => f.usuarioId === usuarioId)
      .sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime());
  },

  async prefixosFavoritos(usuarioId) {
    const set = new Set<string>();
    for (const fav of armazenamento.values()) {
      if (fav.usuarioId === usuarioId) set.add(fav.prefixo);
    }
    return set;
  },

  async contar(usuarioId) {
    let n = 0;
    for (const fav of armazenamento.values()) {
      if (fav.usuarioId === usuarioId) n += 1;
    }
    return n;
  },
};
