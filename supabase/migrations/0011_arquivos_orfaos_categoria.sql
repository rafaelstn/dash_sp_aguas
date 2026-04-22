-- =============================================================================
-- Migration 0011 — Categoria e tipo_dado em `arquivos_orfaos`
-- =============================================================================
-- Adiciona `categoria` (classificação operacional) e `tipo_dado` (quando
-- detectável pela pasta raiz da varredura). Mantém a coluna `motivo` da v1.1
-- por compatibilidade com dados já gravados.
-- =============================================================================

ALTER TABLE arquivos_orfaos
  ADD COLUMN IF NOT EXISTS categoria VARCHAR(32) NOT NULL DEFAULT 'PREFIXO_DESCONHECIDO',
  ADD COLUMN IF NOT EXISTS tipo_dado VARCHAR(32) NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_orfao_categoria'
  ) THEN
    ALTER TABLE arquivos_orfaos
      ADD CONSTRAINT chk_orfao_categoria
        CHECK (categoria IN ('PREFIXO_DESCONHECIDO','NOME_FORA_DO_PADRAO','EXTENSAO_NAO_PDF'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_orfao_tipo_dado'
  ) THEN
    ALTER TABLE arquivos_orfaos
      ADD CONSTRAINT fk_orfao_tipo_dado
        FOREIGN KEY (tipo_dado) REFERENCES tipos_dado (codigo)
        ON DELETE RESTRICT;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_orfaos_categoria
  ON arquivos_orfaos (categoria);

CREATE INDEX IF NOT EXISTS idx_orfaos_tipo_dado
  ON arquivos_orfaos (tipo_dado);
