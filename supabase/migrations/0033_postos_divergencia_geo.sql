-- =============================================================================
-- Migration 0033, analise proativa de divergencia geografica em postos.
-- =============================================================================
-- Contexto: ate aqui, divergencia coord vs municipio so era detectada quando
-- a ANA apontava no ciclo PROGESTAO. Decisao Rafael 2026-05-14: a SPAguas
-- deve detectar essas divergencias **proativamente** em todos os 2483 postos,
-- nao so naqueles que a ANA reclamou.
--
-- Esta migration adiciona em `postos`:
--   * geom (Point, SRID 4674)        ponto SP / SIRGAS 2000
--   * divergencia_municipio          'ok' | 'margem_aceitavel' | 'divergente' | 'sem_coordenada'
--   * distancia_municipio_m          metros ate a fronteira do municipio declarado
--   * municipio_correto_ibge         nome IBGE que de fato contem a coordenada
--   * municipio_correto_codigo_ibge  codigo IBGE 7 digitos
--   * analise_geo_em                 timestamp da ultima analise (NULL = pendente)
--
-- Trigger invalida `analise_geo_em` quando lat/lng/municipio mudam.
-- Funcao `recalcular_divergencia_postos(p_id UUID)` calcula 1 posto.
-- Funcao `recalcular_divergencia_postos_todos()` faz batch em ate 5000 postos
-- pendentes (filtro `analise_geo_em IS NULL`).
-- =============================================================================

ALTER TABLE postos
  ADD COLUMN IF NOT EXISTS geom                          geometry(Point, 4674),
  ADD COLUMN IF NOT EXISTS divergencia_municipio         TEXT
    CHECK (divergencia_municipio IN ('ok', 'margem_aceitavel', 'divergente', 'sem_coordenada')),
  ADD COLUMN IF NOT EXISTS distancia_municipio_m         NUMERIC,
  ADD COLUMN IF NOT EXISTS municipio_correto_ibge        TEXT,
  ADD COLUMN IF NOT EXISTS municipio_correto_codigo_ibge CHAR(7),
  ADD COLUMN IF NOT EXISTS analise_geo_em                TIMESTAMPTZ;

COMMENT ON COLUMN postos.divergencia_municipio IS
  'Classificacao automatica via PostGIS contra IBGE: ok = ponto dentro do municipio declarado; margem_aceitavel = fora mas <10km da fronteira; divergente = fora e >=10km (alerta); sem_coordenada = lat/lng nulos.';

CREATE INDEX IF NOT EXISTS idx_postos_geom
  ON postos USING GIST (geom)
  WHERE geom IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_postos_divergencia
  ON postos (divergencia_municipio)
  WHERE divergencia_municipio IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_postos_analise_pendente
  ON postos (id)
  WHERE analise_geo_em IS NULL AND deleted_at IS NULL;

-- -----------------------------------------------------------------------------
-- Trigger: invalidar analise_geo_em quando coord ou municipio mudam
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_postos_invalidar_analise_geo()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.latitude IS DISTINCT FROM OLD.latitude
     OR NEW.longitude IS DISTINCT FROM OLD.longitude
     OR NEW.municipio IS DISTINCT FROM OLD.municipio THEN
    NEW.analise_geo_em := NULL;
    -- geom recalculado a partir das novas coords (se houver)
    IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
      NEW.geom := ST_SetSRID(ST_MakePoint(NEW.longitude::float, NEW.latitude::float), 4674);
    ELSE
      NEW.geom := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'postos_invalidar_analise_geo') THEN
    CREATE TRIGGER postos_invalidar_analise_geo
    BEFORE UPDATE OF latitude, longitude, municipio ON postos
    FOR EACH ROW EXECUTE FUNCTION trg_postos_invalidar_analise_geo();
  END IF;
END$$;

-- -----------------------------------------------------------------------------
-- Recalcular um posto especifico
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION recalcular_divergencia_posto(p_id UUID)
RETURNS VOID AS $$
DECLARE
  v_geom              geometry;
  v_municipio_decl    TEXT;
  v_dentro            BOOLEAN;
  v_distancia_m       NUMERIC;
  v_sug_codigo        CHAR(7);
  v_sug_nome          TEXT;
  v_classificacao     TEXT;
BEGIN
  SELECT geom, municipio INTO v_geom, v_municipio_decl
    FROM postos WHERE id = p_id;

  IF v_geom IS NULL THEN
    UPDATE postos
       SET divergencia_municipio = 'sem_coordenada',
           distancia_municipio_m = NULL,
           municipio_correto_ibge = NULL,
           municipio_correto_codigo_ibge = NULL,
           analise_geo_em = NOW()
     WHERE id = p_id;
    RETURN;
  END IF;

  -- Municipio que de fato contem a coord
  SELECT m.codigo_ibge, m.nome
    INTO v_sug_codigo, v_sug_nome
    FROM ibge_municipios_sp m
   WHERE ST_Contains(m.geom, v_geom)
   LIMIT 1;

  -- Distancia ate o municipio declarado (matching por nome unaccent + lower)
  IF v_municipio_decl IS NOT NULL THEN
    SELECT ST_Contains(m.geom, v_geom),
           ST_Distance(m.geom::geography, v_geom::geography)
      INTO v_dentro, v_distancia_m
      FROM ibge_municipios_sp m
     WHERE LOWER(unaccent(m.nome)) = LOWER(unaccent(v_municipio_decl))
     LIMIT 1;
  END IF;

  IF v_dentro IS TRUE THEN
    v_classificacao := 'ok';
  ELSIF v_dentro IS FALSE AND v_distancia_m IS NOT NULL AND v_distancia_m < 10000 THEN
    v_classificacao := 'margem_aceitavel';
  ELSIF v_dentro IS FALSE THEN
    v_classificacao := 'divergente';
  ELSIF v_sug_codigo IS NOT NULL THEN
    -- Municipio declarado nao encontrado no IBGE mas coord cai em algum
    v_classificacao := 'divergente';
  ELSE
    v_classificacao := 'sem_coordenada';
  END IF;

  UPDATE postos
     SET divergencia_municipio = v_classificacao,
         distancia_municipio_m = v_distancia_m,
         municipio_correto_ibge = v_sug_nome,
         municipio_correto_codigo_ibge = v_sug_codigo,
         analise_geo_em = NOW()
   WHERE id = p_id;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- Batch: recalcular todos com analise pendente (analise_geo_em IS NULL)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION recalcular_divergencia_postos_todos(p_limite INT DEFAULT 5000)
RETURNS INTEGER AS $$
DECLARE
  v_total INTEGER := 0;
BEGIN
  -- Popula geom onde ainda nao foi populado
  UPDATE postos
     SET geom = ST_SetSRID(ST_MakePoint(longitude::float, latitude::float), 4674)
   WHERE latitude IS NOT NULL AND longitude IS NOT NULL
     AND geom IS NULL
     AND deleted_at IS NULL;

  -- Recalculo em massa
  WITH sugestao AS (
    SELECT p.id AS posto_id, m.codigo_ibge AS sug_codigo, m.nome AS sug_nome
      FROM postos p
      JOIN ibge_municipios_sp m ON ST_Contains(m.geom, p.geom)
     WHERE p.analise_geo_em IS NULL
       AND p.geom IS NOT NULL
       AND p.deleted_at IS NULL
     LIMIT p_limite
  ),
  declarado AS (
    SELECT p.id AS posto_id,
           BOOL_OR(ST_Contains(m.geom, p.geom)) AS dentro,
           MIN(ST_Distance(m.geom::geography, p.geom::geography)) AS dist
      FROM postos p
      LEFT JOIN ibge_municipios_sp m
        ON LOWER(unaccent(m.nome)) = LOWER(unaccent(p.municipio))
     WHERE p.analise_geo_em IS NULL
       AND p.geom IS NOT NULL
       AND p.deleted_at IS NULL
     GROUP BY p.id
     LIMIT p_limite
  )
  UPDATE postos pst
     SET divergencia_municipio = CASE
           WHEN d.dentro IS TRUE THEN 'ok'
           WHEN d.dentro IS FALSE AND d.dist < 10000 THEN 'margem_aceitavel'
           WHEN d.dentro IS FALSE THEN 'divergente'
           WHEN s.sug_codigo IS NOT NULL THEN 'divergente'
           ELSE 'sem_coordenada'
         END,
         distancia_municipio_m = d.dist,
         municipio_correto_ibge = s.sug_nome,
         municipio_correto_codigo_ibge = s.sug_codigo,
         analise_geo_em = NOW()
    FROM declarado d
    LEFT JOIN sugestao s ON s.posto_id = d.posto_id
   WHERE pst.id = d.posto_id;

  GET DIAGNOSTICS v_total = ROW_COUNT;

  -- Postos sem coord
  UPDATE postos
     SET divergencia_municipio = 'sem_coordenada',
         analise_geo_em = NOW()
   WHERE analise_geo_em IS NULL
     AND geom IS NULL
     AND deleted_at IS NULL;

  RETURN v_total;
END;
$$ LANGUAGE plpgsql;
