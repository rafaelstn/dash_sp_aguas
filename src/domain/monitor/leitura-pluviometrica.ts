/**
 * Entidade Leitura Pluviométrica do Monitor.
 *
 * Espelha a tabela `leituras_pluviometricas` (migration 0046): série temporal
 * de chuva por estação, com os dois canais (manual e automático) na mesma
 * linha. UNIQUE (estacao_id, momento) garante uma leitura por instante e
 * permite ingestão idempotente via ON CONFLICT.
 *
 * Tipo puro, sem I/O nem dependência de infraestrutura.
 */

export interface LeituraPluviometrica {
  /** Chave técnica (BIGSERIAL no banco; exposta como número). */
  id: number;
  estacaoId: string;
  momento: Date;
  /** Acumulado do canal manual em milímetros (default 0 no banco). */
  manualMm: number;
  /** Acumulado do canal automático em milímetros (default 0 no banco). */
  automaticoMm: number;
  criadoEm: Date;
}

/**
 * Dados para upsert idempotente de leitura (usado pelo sync da fase B1.2). Não
 * inclui `id` (gerado pelo banco) nem `criadoEm` (default NOW()). A chave de
 * conflito é (estacaoId, momento).
 */
export interface UpsertLeituraPluviometrica {
  estacaoId: string;
  momento: Date;
  manualMm: number;
  automaticoMm: number;
}
