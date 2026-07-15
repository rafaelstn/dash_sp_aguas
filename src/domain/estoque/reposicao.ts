/**
 * Regra de reposicao (estoque minimo) dos materiais QUANTIFICAVEIS. Puro e
 * testavel; sem dependencia de banco. Espelha a coluna
 * `estoque_materiais.quantidade_minima` (migration 0061).
 *
 * O saldo de um quantificavel e a soma de `estoque_saldos.quantidade` por
 * material (varios locais/tamanhos). Este helper recebe esse total ja somado
 * (quem soma e o agrupamento de saldos, ver `saldos-agrupados.ts`).
 */

/**
 * True quando o material esta abaixo do minimo (precisa reposicao).
 *
 * - `quantidadeMinima == null` (sem minimo definido): NUNCA dispara.
 * - saldo IGUAL ao minimo: NAO esta abaixo (o minimo e o piso aceitavel).
 * - saldo MENOR que o minimo: esta abaixo.
 *
 * Nao valida natureza: em serializado o minimo e sempre null (a coluna fica
 * null), entao o guard de null ja o exclui. So faz sentido chamar com o saldo
 * total de um quantificavel.
 */
export function abaixoDoMinimo(
  saldoTotal: number,
  quantidadeMinima: number | null,
): boolean {
  return quantidadeMinima != null && saldoTotal < quantidadeMinima;
}
