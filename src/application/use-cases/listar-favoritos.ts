import type { FavoritosRepository } from '@/application/ports/favoritos-repository';
import type { PostosRepository } from '@/application/ports/postos-repository';
import type { Posto } from '@/domain/posto';

export interface ItemListaFavorito {
  posto: Posto;
  favoritadoEm: Date;
}

/**
 * Lista favoritos do usuário + resolve cada prefixo no cadastro `postos`.
 * Se um favorito aponta pra prefixo que não existe mais (caso limite — FK
 * com ON DELETE CASCADE cuida, mas defensivo), entra como posto nulo.
 */
export async function listarFavoritos(
  favoritosRepo: FavoritosRepository,
  postosRepo: PostosRepository,
  usuarioId: string,
): Promise<ItemListaFavorito[]> {
  if (!usuarioId) return [];
  const favoritos = await favoritosRepo.listar(usuarioId);
  if (favoritos.length === 0) return [];

  const postos = await Promise.all(
    favoritos.map((f) => postosRepo.buscarPorPrefixo(f.prefixo)),
  );

  const itens: ItemListaFavorito[] = [];
  favoritos.forEach((f, i) => {
    const posto = postos[i];
    if (posto) {
      itens.push({ posto, favoritadoEm: f.criadoEm });
    }
  });
  return itens;
}
