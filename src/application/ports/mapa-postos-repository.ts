import type { PontoMapaPosto } from '@/domain/mapa-postos';

/**
 * Filtros de CADASTRO que o mapa herda da busca de Postos.
 *
 * São os que dependem de texto e de junção no banco (termo, município, curso
 * d'água, mantenedor, favoritos) e por isso são resolvidos pelo adaptador. As
 * dimensões classificadas (tipo, situação, transmissão, vazão e UGRHI) NÃO
 * entram aqui: o adaptador devolve todos os pontos que casam com o cadastro, e
 * o caso de uso filtra e conta as facetas em memória, uma vez, com a mesma
 * regra para as duas origens (ver `domain/mapa-postos.ts`).
 *
 * `termo` e `prefixoComecaCom` chegam já roteados pelo caso de uso, pela mesma
 * régua da busca paginada (`pareceCodigoDePosto`).
 */
export interface FiltroCadastroMapa {
  readonly termo?: string;
  readonly prefixoComecaCom?: string;
  readonly municipio?: string;
  readonly baciaHidrografica?: string;
  readonly mantenedor?: string;
  /** Exige `usuarioId`; sem ele a resposta é vazia, e não a base inteira. */
  readonly apenasFavoritos?: boolean;
  readonly usuarioId?: string | null;
}

export interface MapaPostosRepository {
  /**
   * Todos os postos não excluídos que casam com o filtro de cadastro, já
   * classificados. Sem paginação, por decisão de produto: o mapa desenha a
   * base inteira (5.790 postos no `Dbfch` em 17/09/2026).
   *
   * Ordenado por prefixo, para a resposta ser estável entre chamadas.
   */
  listarPontos(filtro: FiltroCadastroMapa): Promise<readonly PontoMapaPosto[]>;
}
