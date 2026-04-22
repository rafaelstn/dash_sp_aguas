-- =============================================================================
-- Migration 0003 — Tabela `arquivos_indexados` (PDFs com prefixo reconhecido)
-- =============================================================================
-- Mantida reconstrutível pelo worker de indexação.
-- Sem FK para postos.prefixo: a relação é lógica. Arquivos sem match vão para
-- arquivos_orfaos (migration 0004).
-- =============================================================================

CREATE TABLE IF NOT EXISTS arquivos_indexados (
  id                   UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  prefixo              VARCHAR(32)   NOT NULL,
  nome_arquivo         TEXT          NOT NULL,
  caminho_absoluto     TEXT          NOT NULL,
  tamanho_bytes        BIGINT        NOT NULL,
  data_modificacao     TIMESTAMPTZ   NOT NULL,
  hash_conteudo        VARCHAR(64)   NULL,
  indexado_em          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  lote_indexacao       UUID          NOT NULL,

  CONSTRAINT uq_arquivo UNIQUE (caminho_absoluto)
);

CREATE INDEX IF NOT EXISTS idx_arquivos_prefixo
  ON arquivos_indexados (prefixo);

CREATE INDEX IF NOT EXISTS idx_arquivos_lote
  ON arquivos_indexados (lote_indexacao);

CREATE INDEX IF NOT EXISTS idx_arquivos_data_mod
  ON arquivos_indexados (data_modificacao DESC);
