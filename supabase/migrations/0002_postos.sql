-- =============================================================================
-- Migration 0002 — Tabela `postos` (entidade cadastral principal)
-- =============================================================================
-- 37 campos cadastrais + coluna gerada para FTS em pt-BR sem acento.
-- =============================================================================

CREATE TABLE IF NOT EXISTS postos (
  id                        UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  prefixo                   VARCHAR(32)   NOT NULL UNIQUE,
  mantenedor                TEXT          NULL,
  prefixo_ana               VARCHAR(64)   NULL,
  nome_estacao              TEXT          NULL,
  operacao_inicio_ano       INTEGER       NULL,
  operacao_fim_ano          INTEGER       NULL,
  latitude                  NUMERIC(10,7) NULL,
  longitude                 NUMERIC(10,7) NULL,
  municipio                 TEXT          NULL,
  municipio_alt             TEXT          NULL,
  bacia_hidrografica        TEXT          NULL,
  ugrhi_nome                TEXT          NULL,
  ugrhi_numero              VARCHAR(16)   NULL,
  sub_ugrhi_nome            TEXT          NULL,
  sub_ugrhi_numero          VARCHAR(16)   NULL,
  rede                      TEXT          NULL,
  proprietario              TEXT          NULL,
  tipo_posto                VARCHAR(32)   NULL,
  area_km2                  NUMERIC(12,3) NULL,
  btl                       TEXT          NULL,
  cia_ambiental             TEXT          NULL,
  cobacia                   TEXT          NULL,
  observacoes               TEXT          NULL,
  tempo_transmissao         TEXT          NULL,
  status_pcd                TEXT          NULL,
  ultima_transmissao        TEXT          NULL,   -- texto livre na planilha original
  convencional              TEXT          NULL,
  logger_eqp                TEXT          NULL,
  telemetrico               TEXT          NULL,
  nivel                     TEXT          NULL,
  vazao                     TEXT          NULL,
  ficha_inspecao            TEXT          NULL,
  ultima_data_fi            TEXT          NULL,   -- texto livre na planilha original
  ficha_descritiva          TEXT          NULL,
  ultima_atualizacao_fd     TEXT          NULL,   -- texto livre na planilha original
  aquifero                  TEXT          NULL,
  altimetria                NUMERIC(10,3) NULL,

  created_at                TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  busca_tsv                 TSVECTOR
    GENERATED ALWAYS AS (
      to_tsvector(
        'portuguese',
        f_unaccent(coalesce(prefixo,'') || ' ' ||
                   coalesce(nome_estacao,'') || ' ' ||
                   coalesce(municipio,'') || ' ' ||
                   coalesce(municipio_alt,'') || ' ' ||
                   coalesce(bacia_hidrografica,'') || ' ' ||
                   coalesce(ugrhi_nome,'') || ' ' ||
                   coalesce(sub_ugrhi_nome,'') || ' ' ||
                   coalesce(proprietario,'') || ' ' ||
                   coalesce(mantenedor,''))
      )
    ) STORED,

  CONSTRAINT chk_postos_anos
    CHECK (operacao_fim_ano IS NULL
           OR operacao_inicio_ano IS NULL
           OR operacao_fim_ano >= operacao_inicio_ano)
);

CREATE INDEX IF NOT EXISTS idx_postos_prefixo_trgm
  ON postos USING gin (prefixo gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_postos_busca_tsv
  ON postos USING gin (busca_tsv);

CREATE INDEX IF NOT EXISTS idx_postos_tipo
  ON postos (tipo_posto);

-- Trigger de updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_postos_updated_at ON postos;
CREATE TRIGGER trg_postos_updated_at
  BEFORE UPDATE ON postos
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
