-- =============================================================================
-- Migration 0004 — Tabela `arquivos_orfaos`
-- =============================================================================
-- Arquivos encontrados no HD de rede cujo nome não casou com nenhum prefixo
-- conhecido em `postos`. Ficam para curadoria manual posterior.
-- =============================================================================

CREATE TABLE IF NOT EXISTS arquivos_orfaos (
  id                   UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome_arquivo         TEXT          NOT NULL,
  caminho_absoluto     TEXT          NOT NULL,
  tamanho_bytes        BIGINT        NOT NULL,
  data_modificacao     TIMESTAMPTZ   NOT NULL,
  indexado_em          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  lote_indexacao       UUID          NOT NULL,
  motivo               TEXT          NOT NULL DEFAULT 'prefixo_nao_identificado',

  CONSTRAINT uq_arquivo_orfao UNIQUE (caminho_absoluto)
);

CREATE INDEX IF NOT EXISTS idx_orfaos_lote
  ON arquivos_orfaos (lote_indexacao);

CREATE INDEX IF NOT EXISTS idx_orfaos_indexado
  ON arquivos_orfaos (indexado_em DESC);
