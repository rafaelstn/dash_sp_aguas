import type { PontoMapaPosto } from '@/domain/mapa-postos';

/**
 * Filtros de CADASTRO que o mapa herda da busca de Postos.
 *
 * São os que dependem de texto e de junção no banco (termo, município, curso
 * d'água, favoritos) e por isso são resolvidos pelo adaptador. As dimensões
 * classificadas (tipo, situação, transmissão, vazão, UGRHI, UF e mantenedor)
 * NÃO entram aqui: o adaptador devolve todos os pontos que casam com o
 * cadastro, e o caso de uso filtra e conta as facetas em memória, uma vez, com
 * a mesma regra para as duas origens (ver `domain/mapa-postos.ts`).
 *
 * O `mantenedor` ESTAVA aqui, resolvido no `WHERE` com a comparação `CI_AI`, e
 * saiu em 05/10/2026: a demanda do órgão pede a lista de mantenedores com a
 * contagem, e faceta é contagem CRUZADA (cada dimensão conta ignorando o
 * próprio filtro). Recortado no SQL, o adaptador devolveria só os postos do
 * mantenedor escolhido e a lista mostraria uma opção só, que é a que a pessoa
 * já marcou. A igualdade sem caixa e sem acento virou `chaveMantenedor`.
 *
 * `termo` e `prefixoComecaCom` chegam já roteados pelo caso de uso, pela mesma
 * régua da busca paginada (`pareceCodigoDePosto`).
 */
export interface FiltroCadastroMapa {
  readonly termo?: string;
  readonly prefixoComecaCom?: string;
  readonly municipio?: string;
  readonly baciaHidrografica?: string;
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
