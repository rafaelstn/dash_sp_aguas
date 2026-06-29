/**
 * Entidade Estação Pluviométrica do Monitor.
 *
 * Espelha a tabela `estacoes_pluviometricas` (migration 0045). O Monitor
 * PERSISTE no banco (decisão de arquitetura): esta entidade representa a linha
 * conciliada localmente, não o formato cru do SIBH (esse vive em
 * `EstacaoSibh`, no port `sibh-gateway`).
 *
 * Tipo puro, sem I/O nem dependência de infraestrutura.
 */

/**
 * Tipo de medição da estação. Espelha o CHECK da coluna `tipo` da migration
 * 0045: só 'manual' ou 'automatico' são valores válidos no banco.
 */
export type TipoEstacaoPluviometrica = 'manual' | 'automatico';

export interface EstacaoPluviometrica {
  id: string;
  /**
   * Código da estação no SIBH (fonte oficial). Pode ser `null` enquanto a
   * estação não está conciliada; quando preenchido é único (índice parcial
   * único na migration 0045). É a chave usada pelo sync via upsert.
   */
  prefixo: string | null;
  nome: string;
  lat: number;
  lng: number;
  tipo: TipoEstacaoPluviometrica;
  bacia: string | null;
  /**
   * Entidade responsável pela estação (SIBH `station_owner`). `null` quando não
   * informado; exibido como "Outros" e usado para a cor/filtro por entidade.
   */
  owner: string | null;
  /** Vínculo opcional ao catálogo interno `postos` (ON DELETE SET NULL). */
  postoId: string | null;
  /** Identificador do registro no SIBH, para reconciliação futura. */
  sibhId: string | null;
  criadoEm: Date;
}

/**
 * Dados para upsert idempotente de estação por prefixo (usado pelo sync da
 * fase B1.2). `prefixo` é obrigatório aqui porque é a chave de conflito; os
 * demais campos refletem o que vem do SIBH na conciliação.
 */
export interface UpsertEstacaoPluviometrica {
  prefixo: string;
  nome: string;
  lat: number;
  lng: number;
  tipo: TipoEstacaoPluviometrica;
  bacia?: string | null;
  owner?: string | null;
  postoId?: string | null;
  sibhId?: string | null;
}

/**
 * Filtros opcionais de listagem de estações. Combinados com AND; ausência de
 * filtro significa "qualquer".
 */
export interface FiltrosEstacaoPluviometrica {
  bacia?: string;
  tipo?: TipoEstacaoPluviometrica;
  owner?: string;
}
