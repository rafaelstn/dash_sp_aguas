-- =============================================================================
-- Migration 0038, match sugerido entre estacoes ANA e postos SP.
-- =============================================================================
-- Pra cada estacao ANA sem codigo_adicional preenchido (ou onde o match
-- inicial falhou), tenta identificar o posto SP correspondente via:
--   1. Trigram no nome (similaridade textual, pg_trgm)
--   2. Mesmo municipio (case+accent insensitive)
--   3. Coord dentro de 5km (PostGIS)
--   4. Score combinado define confianca alta/media/baixa
--
-- O posto sugerido fica na coluna match_sugerido_posto_id. Marcio pode
-- aceitar (1 clique -> postos.prefixo_ana = e.codigo_ana, vincula posto_id
-- na estacao ANA) ou rejeitar.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE ana_revisao_estacao
  ADD COLUMN IF NOT EXISTS match_sugerido_posto_id    UUID REFERENCES postos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS match_sugerido_confianca   TEXT
    CHECK (match_sugerido_confianca IN ('alta', 'media', 'baixa')),
  ADD COLUMN IF NOT EXISTS match_sugerido_score       NUMERIC,
  ADD COLUMN IF NOT EXISTS match_sugerido_calculado_em TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_ana_match_sugerido_posto
  ON ana_revisao_estacao (match_sugerido_posto_id)
  WHERE match_sugerido_posto_id IS NOT NULL;

COMMENT ON COLUMN ana_revisao_estacao.match_sugerido_posto_id IS
  'Posto SP candidato a corresponder a esta estacao ANA. Calculado por similaridade de nome + proximidade geografica + mesmo municipio. Marcio aceita ou rejeita.';
