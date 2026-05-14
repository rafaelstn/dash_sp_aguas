-- =============================================================================
-- Migration 0030, PostGIS + tabela `ibge_municipios_sp` + colunas geográficas
-- em `ana_revisao_estacao` para detecção de divergência município ↔ coordenada.
-- =============================================================================
-- Contexto: o cenário (k) da revisão ANA aponta 197 estações com município
-- incompatível com coordenadas. Em vez de heurística por centroide (que dá
-- falso positivo em município grande, ex. Iguape ~80km), usamos polígono
-- real do município (shapefile IBGE público, SP, 645 municípios) e a função
-- ST_Within para resposta binária "ponto está dentro?".
--
-- Quando o ponto NÃO está dentro do município declarado, calculamos:
--   distancia_municipio_declarado_m = ST_Distance até a fronteira do
--                                     município que a planilha ANA informou
--   municipio_sugerido_codigo       = código IBGE do município que de fato
--                                     contém o ponto (NULL se nenhum)
--
-- Threshold de alerta: 10 km (decisão Rafael 2026-05-14). Abaixo disso,
-- tratamos como "margem de erro de cadastro"; igual ou acima, exibe alerta
-- vermelho e sugere correção do município declarado para o real.
--
-- O shapefile é populado por `scripts/importar_ibge_municipios.py` que lê
-- BR_Municipios_2024.shp filtrado por UF=SP. Geometria em SRID 4674
-- (SIRGAS 2000, padrão IBGE).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS postgis;

-- -----------------------------------------------------------------------------
-- Tabela de municípios SP (IBGE 2024, polígonos)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ibge_municipios_sp (
  codigo_ibge   CHAR(7)                      PRIMARY KEY,
  nome          TEXT                         NOT NULL,
  uf            CHAR(2)                      NOT NULL DEFAULT 'SP',
  area_km2      NUMERIC                      NULL,
  geom          GEOMETRY(MultiPolygon, 4674) NOT NULL,
  criado_em     TIMESTAMPTZ                  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE ibge_municipios_sp IS
  'Malha municipal IBGE 2024 filtrada para SP (645 municípios). Geometria em SIRGAS 2000 (SRID 4674).';

CREATE INDEX IF NOT EXISTS idx_ibge_municipios_sp_geom
  ON ibge_municipios_sp USING GIST (geom);

CREATE INDEX IF NOT EXISTS idx_ibge_municipios_sp_nome_lower
  ON ibge_municipios_sp (LOWER(nome));

-- -----------------------------------------------------------------------------
-- Colunas geográficas em ana_revisao_estacao
-- -----------------------------------------------------------------------------
ALTER TABLE ana_revisao_estacao
  ADD COLUMN IF NOT EXISTS geom GEOMETRY(Point, 4674),
  ADD COLUMN IF NOT EXISTS dentro_municipio_declarado BOOLEAN,
  ADD COLUMN IF NOT EXISTS distancia_municipio_declarado_m NUMERIC,
  ADD COLUMN IF NOT EXISTS municipio_sugerido_codigo CHAR(7)
    REFERENCES ibge_municipios_sp (codigo_ibge),
  ADD COLUMN IF NOT EXISTS municipio_sugerido_nome TEXT,
  ADD COLUMN IF NOT EXISTS divergencia_municipio TEXT
    CHECK (divergencia_municipio IN ('ok', 'margem_aceitavel', 'divergente', 'sem_coordenada')),
  ADD COLUMN IF NOT EXISTS analise_geo_em TIMESTAMPTZ;

COMMENT ON COLUMN ana_revisao_estacao.divergencia_municipio IS
  'Classificação da divergência município ↔ coordenada. ok = ponto dentro do município declarado. margem_aceitavel = ponto fora mas a menos de 10km da fronteira. divergente = ponto a mais de 10km da fronteira (alerta). sem_coordenada = lat/lng nulos na planilha ANA.';

CREATE INDEX IF NOT EXISTS idx_ana_revisao_estacao_geom
  ON ana_revisao_estacao USING GIST (geom)
  WHERE geom IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ana_revisao_estacao_divergencia
  ON ana_revisao_estacao (lote_id, divergencia_municipio)
  WHERE divergencia_municipio IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Função utilitária: analisa divergência município/coordenada de uma estação
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION analisar_divergencia_municipio(p_estacao_id UUID)
RETURNS TABLE (
  dentro                BOOLEAN,
  distancia_m           NUMERIC,
  municipio_sug_codigo  CHAR(7),
  municipio_sug_nome    TEXT,
  classificacao         TEXT
) AS $$
DECLARE
  v_geom                GEOMETRY;
  v_mun_decl_nome       TEXT;
  v_mun_decl_codigo     CHAR(7);
BEGIN
  SELECT geom, municipio_nome, municipio_codigo
    INTO v_geom, v_mun_decl_nome, v_mun_decl_codigo
    FROM ana_revisao_estacao
   WHERE id = p_estacao_id;

  IF v_geom IS NULL THEN
    RETURN QUERY SELECT NULL::BOOLEAN, NULL::NUMERIC, NULL::CHAR(7), NULL::TEXT, 'sem_coordenada'::TEXT;
    RETURN;
  END IF;

  -- Município que de fato contém o ponto
  SELECT m.codigo_ibge, m.nome
    INTO municipio_sug_codigo, municipio_sug_nome
    FROM ibge_municipios_sp m
   WHERE ST_Contains(m.geom, v_geom)
   LIMIT 1;

  -- Município declarado: a planilha ANA usa código próprio (não IBGE).
  -- Match por nome ignorando acento e caso.
  -- Distância em metros até a fronteira (0 se dentro).
  SELECT
    ST_Contains(m.geom, v_geom) AS contains,
    ST_Distance(m.geom::geography, v_geom::geography) AS dist
  INTO dentro, distancia_m
  FROM ibge_municipios_sp m
  WHERE LOWER(unaccent(m.nome)) = LOWER(unaccent(v_mun_decl_nome))
  LIMIT 1;

  -- Classificação
  IF dentro IS TRUE THEN
    classificacao := 'ok';
  ELSIF dentro IS FALSE AND distancia_m IS NOT NULL AND distancia_m < 10000 THEN
    classificacao := 'margem_aceitavel';
  ELSIF dentro IS FALSE THEN
    classificacao := 'divergente';
  ELSE
    -- Município declarado não foi encontrado na tabela IBGE.
    -- Trata como divergente se conseguimos sugerir um real, sem_coordenada caso contrário.
    IF municipio_sug_codigo IS NOT NULL THEN
      classificacao := 'divergente';
      dentro := FALSE;
    ELSE
      classificacao := 'sem_coordenada';
    END IF;
  END IF;

  RETURN QUERY SELECT dentro, distancia_m, municipio_sug_codigo, municipio_sug_nome, classificacao;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION analisar_divergencia_municipio IS
  'Recalcula divergência município/coordenada de uma estação. Use o procedimento bulk_analisar_divergencias para batch.';

-- -----------------------------------------------------------------------------
-- Procedure batch: roda análise em todas as estações do lote
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION bulk_analisar_divergencias(p_lote_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  -- Popula geom a partir de latitude/longitude (quando ainda não populada)
  UPDATE ana_revisao_estacao
     SET geom = ST_SetSRID(ST_MakePoint(longitude::float, latitude::float), 4674)
   WHERE lote_id = p_lote_id
     AND latitude IS NOT NULL
     AND longitude IS NOT NULL
     AND geom IS NULL;

  -- Atualiza divergência em lote (mais rápido que loop com analisar_divergencia_municipio)
  WITH sugestao AS (
    SELECT e.id AS estacao_id,
           m.codigo_ibge AS sug_codigo,
           m.nome        AS sug_nome
      FROM ana_revisao_estacao e
      JOIN ibge_municipios_sp m ON ST_Contains(m.geom, e.geom)
     WHERE e.lote_id = p_lote_id
       AND e.geom IS NOT NULL
  ),
  declarado AS (
    -- planilha ANA usa codigo proprio (nao IBGE), match por nome com unaccent
    SELECT e.id AS estacao_id,
           BOOL_OR(ST_Contains(m.geom, e.geom)) AS dentro,
           MIN(ST_Distance(m.geom::geography, e.geom::geography)) AS dist
      FROM ana_revisao_estacao e
      LEFT JOIN ibge_municipios_sp m
        ON LOWER(unaccent(m.nome)) = LOWER(unaccent(e.municipio_nome))
     WHERE e.lote_id = p_lote_id
       AND e.geom IS NOT NULL
     GROUP BY e.id
  )
  UPDATE ana_revisao_estacao e
     SET dentro_municipio_declarado = d.dentro,
         distancia_municipio_declarado_m = d.dist,
         municipio_sugerido_codigo = s.sug_codigo,
         municipio_sugerido_nome = s.sug_nome,
         divergencia_municipio = CASE
           WHEN d.dentro IS TRUE THEN 'ok'
           WHEN d.dentro IS FALSE AND d.dist < 10000 THEN 'margem_aceitavel'
           WHEN d.dentro IS FALSE THEN 'divergente'
           WHEN s.sug_codigo IS NOT NULL THEN 'divergente'
           ELSE 'sem_coordenada'
         END,
         analise_geo_em = NOW()
    FROM declarado d
    LEFT JOIN sugestao s ON s.estacao_id = d.estacao_id
   WHERE e.id = d.estacao_id
     AND e.lote_id = p_lote_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Estações sem coordenada
  UPDATE ana_revisao_estacao
     SET divergencia_municipio = 'sem_coordenada',
         analise_geo_em = NOW()
   WHERE lote_id = p_lote_id
     AND geom IS NULL
     AND divergencia_municipio IS NULL;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION bulk_analisar_divergencias IS
  'Roda análise de divergência município/coordenada em todas as estações do lote. Threshold de divergência: 10km da fronteira (ADR-0011).';

-- Extensão unaccent (necessária para match case+acento-insensitive em nomes de município)
CREATE EXTENSION IF NOT EXISTS unaccent;
