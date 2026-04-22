-- =============================================================================
-- Migration 0006 — Tabela `import_log` (rastreio de cargas do CSV)
-- =============================================================================

CREATE TABLE IF NOT EXISTS import_log (
  id                   UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  arquivo_origem       TEXT          NOT NULL,
  hash_arquivo         VARCHAR(64)   NOT NULL,
  iniciado_em          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  finalizado_em        TIMESTAMPTZ   NULL,
  linhas_lidas         INTEGER       NULL,
  linhas_inseridas     INTEGER       NULL,
  linhas_atualizadas   INTEGER       NULL,
  linhas_rejeitadas    INTEGER       NULL,
  erros_amostra        JSONB         NULL,
  status               VARCHAR(16)   NOT NULL DEFAULT 'em_andamento'
    CHECK (status IN ('em_andamento','ok','erro'))
);

CREATE INDEX IF NOT EXISTS idx_import_log_iniciado
  ON import_log (iniciado_em DESC);
