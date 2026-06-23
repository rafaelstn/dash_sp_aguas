/**
 * Operações puras sobre o traçado (`pontos[]`) de um trecho de rio.
 *
 * O traçado é uma polilinha de vértices absolutos no canvas. A edição fina do
 * rio (Fase A3) move, insere e remove vértices; estas funções concentram a
 * regra para serem testáveis sem React. Invariante do domínio/schema: um rio
 * tem no mínimo 2 pontos — `removerPonto` recusa a remoção que violaria isso.
 */

import type { Posicao } from './tipos';

/** Move o vértice no índice para a nova posição (arredondada a inteiro). */
export function moverPonto(
  pontos: Posicao[],
  indice: number,
  destino: Posicao,
): Posicao[] {
  if (indice < 0 || indice >= pontos.length) return pontos;
  const ponto = { x: Math.round(destino.x), y: Math.round(destino.y) };
  return pontos.map((p, i) => (i === indice ? ponto : p));
}

/**
 * Insere um vértice após `indiceSegmento` (o segmento entre o ponto
 * `indiceSegmento` e o seguinte). Se a posição não vier, usa o ponto médio do
 * segmento. Índice inválido devolve o array inalterado.
 */
export function inserirPonto(
  pontos: Posicao[],
  indiceSegmento: number,
  destino?: Posicao,
): Posicao[] {
  if (indiceSegmento < 0 || indiceSegmento >= pontos.length - 1) return pontos;
  const a = pontos[indiceSegmento]!;
  const b = pontos[indiceSegmento + 1]!;
  const novo = destino
    ? { x: Math.round(destino.x), y: Math.round(destino.y) }
    : { x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2) };
  const proximos = [...pontos];
  proximos.splice(indiceSegmento + 1, 0, novo);
  return proximos;
}

/**
 * Remove o vértice no índice. Recusa (devolve inalterado) se sobrariam menos
 * de 2 pontos, preservando o invariante do rio.
 */
export function removerPonto(pontos: Posicao[], indice: number): Posicao[] {
  if (pontos.length <= 2) return pontos;
  if (indice < 0 || indice >= pontos.length) return pontos;
  return pontos.filter((_, i) => i !== indice);
}
