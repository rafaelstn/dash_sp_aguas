/**
 * Saldo = quantidade MANTIDA de um quantificavel por (material, local, tamanho).
 * Tipo puro, espelha a tabela `estoque_saldos` (migration 0058).
 */

import type { UnidadeFisica } from './local';

export interface Saldo {
  id: string;
  materialId: string;
  localId: string;
  quantidade: number;
  tamanho: string | null;
  atualizadoEm: Date;
}

/**
 * Saldo com contexto denormalizado para leitura (telas de consulta): descricao
 * do material e rotulo/unidade do local, resolvidos por join no repositorio.
 */
export interface SaldoComContexto extends Saldo {
  materialDescricao: string;
  localRotulo: string;
  unidade: UnidadeFisica;
}

/** Filtros da consulta de saldo. Combinados com AND. */
export interface FiltrosSaldo {
  materialId?: string;
  localId?: string;
  unidade?: UnidadeFisica;
}
