-- =============================================================================
-- Migration 0021 — Lazy Indexing (ADR-0006)
-- =============================================================================
-- Contexto: sweep completo do HD leva 10 min+ e degrada UX quando técnico
-- acessa ficha pela primeira vez. Estratégia: varrer somente a pasta do posto
-- sob demanda, cachear resultado 24h, reindexar em background quando stale.
--
-- Duas tabelas novas:
--
--   postos_caminhos — resolve prefixo -> pasta raiz no HD. Alimentado por
--   scripts/seed_postos_caminhos.py que faz busca fuzzy no HD pra achar a
--   pasta de cada um dos 2.483 postos. `ativo=false` quando a pasta não
--   foi localizada (posto novo, pasta renomeada, etc.).
--
--   posto_indexacao_cache — metadados da última indexação on-demand por
--   posto: quando foi, até quando é fresh, mtime mais recente observado
--   (pra detectar mudança no HD sem varrer de novo), status do sweep.
--
-- Idempotente: IF NOT EXISTS em tudo. Safe pra rodar várias vezes.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- postos_caminhos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS postos_caminhos (
  prefixo       VARCHAR(32) PRIMARY KEY REFERENCES postos (prefixo)
                  ON UPDATE CASCADE ON DELETE CASCADE,
  caminho_unc   TEXT         NOT NULL,
  tipo_dado     VARCHAR(32)  NOT NULL,
  ativo         BOOLEAN      NOT NULL DEFAULT true,
  observacao    TEXT         NULL,
  verificado_em TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_postos_caminhos_caminho
  ON postos_caminhos (caminho_unc);

CREATE INDEX IF NOT EXISTS idx_postos_caminhos_ativo
  ON postos_caminhos (ativo) WHERE ativo = true;

COMMENT ON TABLE postos_caminhos IS
  'Mapeia prefixo -> pasta raiz no HD (lazy indexing, ADR-0006). Alimentado por scripts/seed_postos_caminhos.py.';

DROP TRIGGER IF EXISTS trg_postos_caminhos_updated_at ON postos_caminhos;
CREATE TRIGGER trg_postos_caminhos_updated_at
  BEFORE UPDATE ON postos_caminhos
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();


-- ---------------------------------------------------------------------------
-- posto_indexacao_cache
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS posto_indexacao_cache (
  prefixo            VARCHAR(32) PRIMARY KEY REFERENCES postos (prefixo)
                       ON UPDATE CASCADE ON DELETE CASCADE,
  indexado_em        TIMESTAMPTZ  NOT NULL,
  expira_em          TIMESTAMPTZ  NOT NULL,
  mtime_hd           TIMESTAMPTZ  NULL,
  arquivos_indexados INTEGER      NOT NULL DEFAULT 0,
  arquivos_orfaos    INTEGER      NOT NULL DEFAULT 0,
  status             VARCHAR(24)  NOT NULL DEFAULT 'ok'
    CHECK (status IN ('ok','pasta_inexistente','sem_permissao','timeout','erro')),
  ultimo_lote        UUID         NULL,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_posto_cache_expira
  ON posto_indexacao_cache (expira_em);

CREATE INDEX IF NOT EXISTS idx_posto_cache_status
  ON posto_indexacao_cache (status);

COMMENT ON TABLE posto_indexacao_cache IS
  'Cache por posto (lazy indexing, ADR-0006). fresh = expira_em > NOW(); stale/miss = dispara reindex.';

DROP TRIGGER IF EXISTS trg_posto_cache_updated_at ON posto_indexacao_cache;
CREATE TRIGGER trg_posto_cache_updated_at
  BEFORE UPDATE ON posto_indexacao_cache
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();


-- ---------------------------------------------------------------------------
-- indexacao_log — adicionar coluna `escopo` para distinguir sweep x posto
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'indexacao_log'
       AND column_name = 'escopo'
  ) THEN
    ALTER TABLE indexacao_log
      ADD COLUMN escopo VARCHAR(16) NOT NULL DEFAULT 'sweep'
        CHECK (escopo IN ('sweep','posto'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'indexacao_log'
       AND column_name = 'prefixo_alvo'
  ) THEN
    ALTER TABLE indexacao_log
      ADD COLUMN prefixo_alvo VARCHAR(32) NULL;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_indexacao_log_escopo
  ON indexacao_log (escopo, iniciado_em DESC);

CREATE INDEX IF NOT EXISTS idx_indexacao_log_prefixo
  ON indexacao_log (prefixo_alvo) WHERE prefixo_alvo IS NOT NULL;
