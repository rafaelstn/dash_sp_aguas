-- =============================================================================
-- Migration 0007 — Tabela `indexacao_log` (rastreio de execuções do worker)
-- =============================================================================

CREATE TABLE IF NOT EXISTS indexacao_log (
  id                      UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  lote_indexacao          UUID          NOT NULL UNIQUE,
  raiz_varredura          TEXT          NOT NULL,
  iniciado_em             TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  finalizado_em           TIMESTAMPTZ   NULL,
  arquivos_encontrados    INTEGER       NULL,
  arquivos_indexados_qtd  INTEGER       NULL,
  arquivos_orfaos_qtd     INTEGER       NULL,
  arquivos_removidos_qtd  INTEGER       NULL,
  erros_amostra           JSONB         NULL,
  status                  VARCHAR(16)   NOT NULL DEFAULT 'em_andamento'
    CHECK (status IN ('em_andamento','ok','erro'))
);

CREATE INDEX IF NOT EXISTS idx_indexacao_log_iniciado
  ON indexacao_log (iniciado_em DESC);
