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

/**
 * Tipo hidrologico da estacao. Espelha o CHECK da coluna `tipo_estacao`
 * (migration 0051) e o `station_type_id` do SIBH. Dimensao distinta de
 * `TipoEstacaoPluviometrica` (canal manual/automatico): aqui e o que a estacao
 * mede (chuva, nivel/cota, agua subterranea).
 */
export type TipoHidrologico = 'pluviometrico' | 'fluviometrico' | 'piezometrico';

export interface EstacaoPluviometrica {
  id: string;
  /**
   * Código da estação no SIBH (fonte oficial). Pode ser `null` enquanto a
   * estação não está conciliada. NÃO é único: o mesmo prefixo aparece em
   * estações de tipos hidrológicos diferentes (a partir da migration 0052 o
   * índice de `prefixo` deixa de ser único). Continua consultável para o
   * vínculo ao catálogo `postos`. A chave natural do upsert é `sibhId`.
   */
  prefixo: string | null;
  nome: string;
  lat: number;
  lng: number;
  tipo: TipoEstacaoPluviometrica;
  /** Tipo hidrologico (o que a estacao mede). Espelha `tipo_estacao` (0051). */
  tipoEstacao: TipoHidrologico;
  bacia: string | null;
  /**
   * Entidade responsável pela estação (SIBH `station_owner`). `null` quando não
   * informado; exibido como "Outros" e usado para a cor/filtro por entidade.
   */
  owner: string | null;
  /** Vínculo opcional ao catálogo interno `postos` (ON DELETE SET NULL). */
  postoId: string | null;
  /**
   * Identificador do registro no SIBH. É a chave natural/estável da estação
   * (único quando preenchido, índice parcial único na migration 0052). `null`
   * só em linhas legadas não conciliadas.
   */
  sibhId: string | null;
  criadoEm: Date;
}

/**
 * Dados para upsert idempotente de estação por `sibhId` (usado pelo sync da
 * fase B1.2). `sibhId` é obrigatório aqui porque é a chave de conflito (a
 * origem é sempre o SIBH); `prefixo` virou atributo (pode repetir entre tipos,
 * pode ser `null`). Os demais campos refletem o que vem do SIBH na conciliação.
 */
export interface UpsertEstacaoPluviometrica {
  /** Chave natural/estável da estação no SIBH. Obrigatório: é o alvo do upsert. */
  sibhId: string;
  /** Código no SIBH. Atributo (não é chave): pode repetir entre tipos ou ser nulo. */
  prefixo: string | null;
  nome: string;
  lat: number;
  lng: number;
  tipo: TipoEstacaoPluviometrica;
  /** Tipo hidrologico da estacao (obrigatorio na conciliacao com o SIBH). */
  tipoEstacao: TipoHidrologico;
  bacia?: string | null;
  owner?: string | null;
  postoId?: string | null;
}

/**
 * Filtros opcionais de listagem de estações. Combinados com AND; ausência de
 * filtro significa "qualquer".
 */
export interface FiltrosEstacaoPluviometrica {
  bacia?: string;
  tipo?: TipoEstacaoPluviometrica;
  /** Filtro opcional pelo tipo hidrologico (pluvio/fluvio/piezo). */
  tipoEstacao?: TipoHidrologico;
  owner?: string;
}
