/**
 * Status = situacao da unidade serializada no inventario (ciclo de vida).
 * Dimensao distinta de `estado` (condicao fisica). Espelha o CHECK da coluna
 * `status` (migration 0057). Quantificavel nao tem status de unidade: seu
 * "descarte" e uma movimentacao `baixa` que reduz saldo.
 *
 * Maquina de estados (ADR 0020 §2.3):
 *   ativo    -> defeito    (apresentou defeito)
 *   ativo    -> descarte   (baixa direta)
 *   defeito  -> ativo      (consertado / reavaliado)
 *   defeito  -> descarte   (baixa por defeito irreversivel)
 *   descarte -> (terminal) (so volta via ajuste admin explicito com motivo)
 *
 * Tipo puro, sem I/O.
 */

export type Status = 'ativo' | 'defeito' | 'descarte';

export const STATUS: readonly Status[] = Object.freeze(['ativo', 'defeito', 'descarte']);

/** Guarda de entrada nao confiavel. */
export function ehStatusValido(valor: unknown): valor is Status {
  return valor === 'ativo' || valor === 'defeito' || valor === 'descarte';
}

/** Transicoes validas do FLUXO NORMAL (baixa/defeito). Ver `transicaoValida`. */
const TRANSICOES: ReadonlyMap<Status, ReadonlySet<Status>> = new Map([
  ['ativo', new Set<Status>(['defeito', 'descarte'])],
  ['defeito', new Set<Status>(['ativo', 'descarte'])],
  // descarte e terminal no fluxo normal; so volta via `ajuste` explicito.
  ['descarte', new Set<Status>()],
]);

/**
 * Valida transicao de status no FLUXO NORMAL (usada por `baixa` e por qualquer
 * mudanca de status que nao seja `ajuste`). Transicao para o mesmo status nao
 * conta como transicao (retorna false). Funcao pura.
 *
 * A reversao de `descarte` (ex.: descarte -> ativo) so e permitida via
 * movimentacao `ajuste` com motivo (override auditavel), fora desta tabela.
 */
export function transicaoValida(de: Status, para: Status): boolean {
  return TRANSICOES.get(de)?.has(para) ?? false;
}
