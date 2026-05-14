-- =============================================================================
-- Migration 0035, coord sugerida para postos divergentes.
-- =============================================================================
-- Decisao Rafael 2026-05-14: pra cada posto com divergencia geografica
-- (coord cai fora do municipio declarado), sugerir uma coordenada que
-- esteja DENTRO do municipio declarado e o mais proxima possivel da
-- coord atual.
--
-- PostGIS ST_ClosestPoint(municipio_geom, posto_geom) devolve o ponto
-- da geometria do municipio mais proximo do posto. Se o posto esta
-- fora, devolve o ponto na fronteira; se dentro, devolve o proprio.
--
-- Resultado: coord nao "inventa" lugar arbitrario. Fica na borda do
-- municipio onde a coord original aponta, mantendo proximidade
-- maxima. Marcio aceita por clique.
-- =============================================================================

ALTER TABLE postos
  ADD COLUMN IF NOT EXISTS lat_sugerida_ibge      NUMERIC,
  ADD COLUMN IF NOT EXISTS lng_sugerida_ibge      NUMERIC,
  ADD COLUMN IF NOT EXISTS distancia_sugerida_m   NUMERIC,
  ADD COLUMN IF NOT EXISTS sugerida_calculada_em  TIMESTAMPTZ;

COMMENT ON COLUMN postos.lat_sugerida_ibge IS
  'Latitude do ponto mais proximo da coord atual que esta DENTRO do municipio declarado (PostGIS ST_ClosestPoint contra IBGE).';

CREATE INDEX IF NOT EXISTS idx_postos_sugerida_pendente
  ON postos (id)
  WHERE divergencia_municipio = 'divergente'
    AND sugerida_calculada_em IS NULL
    AND deleted_at IS NULL;

-- -----------------------------------------------------------------------------
-- Funcao: calcula coord sugerida pra 1 posto divergente
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION calcular_coord_sugerida_posto(p_id UUID)
RETURNS VOID AS $$
DECLARE
  v_geom            geometry;
  v_municipio_decl  TEXT;
  v_pt_sugerido     geometry;
  v_distancia_m     NUMERIC;
BEGIN
  SELECT geom, municipio INTO v_geom, v_municipio_decl
    FROM postos WHERE id = p_id;

  IF v_geom IS NULL OR v_municipio_decl IS NULL THEN
    UPDATE postos
       SET lat_sugerida_ibge = NULL,
           lng_sugerida_ibge = NULL,
           distancia_sugerida_m = NULL,
           sugerida_calculada_em = NOW()
     WHERE id = p_id;
    RETURN;
  END IF;

  -- Ponto da geometria do municipio mais proximo da coord atual.
  -- Se coord ja esta dentro, devolve a propria.
  SELECT ST_ClosestPoint(m.geom, v_geom),
         ST_Distance(v_geom::geography, ST_ClosestPoint(m.geom, v_geom)::geography)
    INTO v_pt_sugerido, v_distancia_m
    FROM ibge_municipios_sp m
   WHERE LOWER(unaccent(m.nome)) = LOWER(unaccent(v_municipio_decl))
   LIMIT 1;

  IF v_pt_sugerido IS NULL THEN
    -- Municipio declarado nao existe no IBGE SP (estacao em outro estado, etc)
    UPDATE postos
       SET lat_sugerida_ibge = NULL,
           lng_sugerida_ibge = NULL,
           distancia_sugerida_m = NULL,
           sugerida_calculada_em = NOW()
     WHERE id = p_id;
    RETURN;
  END IF;

  UPDATE postos
     SET lat_sugerida_ibge = ST_Y(v_pt_sugerido),
         lng_sugerida_ibge = ST_X(v_pt_sugerido),
         distancia_sugerida_m = v_distancia_m,
         sugerida_calculada_em = NOW()
   WHERE id = p_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calcular_coord_sugerida_posto IS
  'Calcula coord sugerida (mais proxima dentro do municipio declarado) para um posto. Atualiza lat_sugerida_ibge / lng_sugerida_ibge / distancia_sugerida_m / sugerida_calculada_em.';
