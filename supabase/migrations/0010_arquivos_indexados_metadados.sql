-- =============================================================================
-- Migration 0010 — Metadados derivados em `arquivos_indexados`
-- =============================================================================
-- Adiciona as colunas extraídas pelo worker a partir do parsing do nome de
-- arquivo (documentação oficial do cliente, 22/04/2026):
--   tipo_dado, cod_tipo_documento, cod_encarregado, data_documento,
--   parte_opcional, nome_valido.
-- Também introduz FKs para `tipos_dado` e `tipos_documento`.
-- Idempotente via IF NOT EXISTS; FKs em bloco DO $$ para não falhar em reexec.
-- =============================================================================

ALTER TABLE arquivos_indexados
  ADD COLUMN IF NOT EXISTS tipo_dado          VARCHAR(32),
  ADD COLUMN IF NOT EXISTS cod_tipo_documento SMALLINT,
  ADD COLUMN IF NOT EXISTS cod_encarregado    VARCHAR(8),
  ADD COLUMN IF NOT EXISTS data_documento     DATE,
  ADD COLUMN IF NOT EXISTS parte_opcional     TEXT,
  ADD COLUMN IF NOT EXISTS nome_valido        BOOLEAN NOT NULL DEFAULT true;

-- Em base já populada pela v1.1, tipo_dado é NULL até o próximo lote rodar.
-- Forçamos NOT NULL somente após o backfill manual (fora do MVP automático).
-- Aqui deixamos NULL-permitido para não quebrar migrations sobre base em uso.
-- A aplicação tolera NULL (exibido como "Sem classificação" na US-010).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_arquivos_tipo_dado'
  ) THEN
    ALTER TABLE arquivos_indexados
      ADD CONSTRAINT fk_arquivos_tipo_dado
        FOREIGN KEY (tipo_dado) REFERENCES tipos_dado (codigo)
        ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_arquivos_tipo_documento'
  ) THEN
    ALTER TABLE arquivos_indexados
      ADD CONSTRAINT fk_arquivos_tipo_documento
        FOREIGN KEY (cod_tipo_documento) REFERENCES tipos_documento (codigo)
        ON DELETE RESTRICT;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_arquivos_tipo_dado
  ON arquivos_indexados (tipo_dado);

CREATE INDEX IF NOT EXISTS idx_arquivos_tipo_doc
  ON arquivos_indexados (cod_tipo_documento);

CREATE INDEX IF NOT EXISTS idx_arquivos_prefixo_tipo_doc
  ON arquivos_indexados (prefixo, cod_tipo_documento, data_documento DESC);
