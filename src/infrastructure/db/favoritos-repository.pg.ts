import 'server-only';
import type { FavoritosRepository } from '@/application/ports/favoritos-repository';
import type { Favorito } from '@/domain/favorito';
import { FalhaRepositorio } from '@/domain/errors';
import { sql } from './client';

type LinhaFavorito = {
  usuario_id: string;
  prefixo: string;
  created_at: Date;
};

function mapear(linha: LinhaFavorito): Favorito {
  return {
    usuarioId: linha.usuario_id,
    prefixo: linha.prefixo,
    criadoEm: linha.created_at,
  };
}

export const favoritosRepository: FavoritosRepository = {
  async alternar(usuarioId, prefixo) {
    try {
      // Tenta remover; se não existia, insere. Atômico via transação curta
      // — evita race de duplo-INSERT e duplo-DELETE.
      return await sql.begin(async (tx) => {
        const removidas = await tx<
          { usuario_id: string }[]
        >`DELETE FROM postos_favoritos
           WHERE usuario_id = ${usuarioId}::uuid AND prefixo = ${prefixo}
           RETURNING usuario_id`;
        if (removidas.length > 0) {
          return false;
        }
        await tx`INSERT INTO postos_favoritos (usuario_id, prefixo)
                 VALUES (${usuarioId}::uuid, ${prefixo})
                 ON CONFLICT (usuario_id, prefixo) DO NOTHING`;
        return true;
      });
    } catch (e) {
      throw new FalhaRepositorio('favoritos.alternar', e);
    }
  },

  async listar(usuarioId) {
    try {
      const linhas = await sql<LinhaFavorito[]>`
        SELECT usuario_id, prefixo, created_at
          FROM postos_favoritos
         WHERE usuario_id = ${usuarioId}::uuid
         ORDER BY created_at DESC
      `;
      return linhas.map(mapear);
    } catch (e) {
      throw new FalhaRepositorio('favoritos.listar', e);
    }
  },

  async prefixosFavoritos(usuarioId) {
    try {
      const linhas = await sql<{ prefixo: string }[]>`
        SELECT prefixo FROM postos_favoritos
         WHERE usuario_id = ${usuarioId}::uuid
      `;
      return new Set(linhas.map((l) => l.prefixo));
    } catch (e) {
      throw new FalhaRepositorio('favoritos.prefixosFavoritos', e);
    }
  },

  async contar(usuarioId) {
    try {
      const linhas = await sql<{ total: string }[]>`
        SELECT COUNT(*)::text AS total FROM postos_favoritos
         WHERE usuario_id = ${usuarioId}::uuid
      `;
      return Number(linhas[0]?.total ?? 0);
    } catch (e) {
      throw new FalhaRepositorio('favoritos.contar', e);
    }
  },
};
