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
  /**
   * Status de transmissão da estação (SIBH `transmission_status`): 'ok',
   * 'pendente' ou `null`. Espelha a coluna `transmission_status` (migration
   * 0053). Cru; a regra de "online" (por tipo) vive em `estacaoOnline`.
   */
  transmissionStatus: string | null;
  /**
   * Momento da última transmissão (SIBH `date_last_measurement`), em ISO 8601
   * (UTC) ou `null`. Espelha a coluna `ultima_transmissao` timestamptz (migration
   * 0053); o adapter converte o `Date` do banco para ISO. Alimenta "online".
   */
  ultimaTransmissao: string | null;
  /**
   * Havia posto com este mesmo `prefixo` no catálogo do órgão na última
   * sincronização. Espelha a coluna `vinculado_a_posto` (migration 0067).
   *
   * É um FATO, não uma identidade. Depois do ADR-0023 o catálogo de postos vive
   * no SQL Server do órgão, e guardar o `Postos.Id` dele aqui criava uma chave
   * estrangeira entre os dois armazenamentos: era exatamente isso que recusava
   * metade das estações na gravação (cabeçalho da migration 0067). Quem navega
   * até o posto usa `prefixo`, a chave natural comum aos dois lados; o valor do
   * id nunca foi lido por ninguém.
   */
  vinculadoAPosto: boolean;
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
  /**
   * Status de transmissão cru do SIBH ('ok' | 'pendente' | ...) ou null.
   * Persistido em `transmission_status` (migration 0053).
   */
  transmissionStatus?: string | null;
  /**
   * Última transmissão do SIBH. Aceita a STRING crua do SIBH (formato
   * `Date#toString()`), ISO 8601, ou null: a fronteira de persistência normaliza
   * para ISO/timestamptz (ver `normalizarTimestampSibh`). Persistido em
   * `ultima_transmissao` (migration 0053).
   */
  ultimaTransmissao?: string | null;
  /**
   * A estação casou com um posto do catálogo do órgão pelo `prefixo`. Ausente
   * equivale a `false`.
   *
   * Note que NÃO existe aqui nenhum identificador do outro armazenamento, e é
   * de propósito: é o tipo que impede a chave estrangeira cruzada de voltar
   * (`postoId` era o campo, a migration 0067 é o histórico).
   */
  vinculadoAPosto?: boolean;
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
