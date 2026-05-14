-- =============================================================================
-- Migration 0035, funcao mover_coord_para_municipio_declarado.
-- =============================================================================
-- Decisao Rafael 2026-05-14: para postos com coord divergente, mover a
-- coordenada para o ponto mais proximo DENTRO do municipio declarado.
-- Estrategia: ST_ClosestPoint(municipio.geom, posto.geom) retorna o ponto
-- na fronteira do municipio mais proximo da coord original. Isso preserva
-- "proxima do informado" e simultaneamente coloca o posto dentro do
-- municipio que ele diz pertencer.
--
-- Se o municipio declarado nao for encontrado na malha IBGE, tenta
-- usar o municipio_correto_ibge (calculado pelo PostGIS) como fallback.
--
-- Retorna TRUE se moveu, FALSE se nao foi possivel (sem coord, sem
-- municipio, ja dentro, etc).
-- =============================================================================

CREATE OR REPLACE FUNCTION mover_coord_para_municipio_declarado(
  p_id UUID,
  p_ator_id UUID DEFAULT NULL,
  p_origem_evento TEXT DEFAULT 'auto_mover_coord_para_municipio'
)
RETURNS BOOLEAN AS $$
DECLARE
  v_geom_posto         geometry;
  v_municipio_decl     TEXT;
  v_municipio_alvo     TEXT;
  v_geom_municipio     geometry;
  v_alvo               geometry;
  v_nova_lat           NUMERIC;
  v_nova_lng           NUMERIC;
  v_lat_antes          NUMERIC;
  v_lng_antes          NUMERIC;
  v_distancia_antes_m  NUMERIC;
BEGIN
  SELECT geom, municipio, latitude, longitude, distancia_municipio_m
    INTO v_geom_posto, v_municipio_decl, v_lat_antes, v_lng_antes, v_distancia_antes_m
    FROM postos WHERE id = p_id;

  IF v_geom_posto IS NULL THEN
    RETURN FALSE;
  END IF;

  -- 1. Tenta municipio declarado
  IF v_municipio_decl IS NOT NULL THEN
    SELECT geom, nome INTO v_geom_municipio, v_municipio_alvo
      FROM ibge_municipios_sp
     WHERE LOWER(unaccent(nome)) = LOWER(unaccent(v_municipio_decl))
     LIMIT 1;
  END IF;

  -- 2. Fallback para municipio_correto_ibge (calculado pelo PostGIS)
  IF v_geom_municipio IS NULL THEN
    SELECT m.geom, m.nome INTO v_geom_municipio, v_municipio_alvo
      FROM postos p
      JOIN ibge_municipios_sp m
        ON m.codigo_ibge = p.municipio_correto_codigo_ibge
     WHERE p.id = p_id;
  END IF;

  IF v_geom_municipio IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Se ja esta dentro do alvo, nao faz nada
  IF ST_Contains(v_geom_municipio, v_geom_posto) THEN
    RETURN FALSE;
  END IF;

  -- Ponto mais proximo da coord original que esta dentro do municipio
  v_alvo := ST_ClosestPoint(v_geom_municipio, v_geom_posto);
  v_nova_lng := ST_X(v_alvo);
  v_nova_lat := ST_Y(v_alvo);

  -- UPDATE (trigger postos_invalidar_analise_geo recalcula geom + invalida analise)
  UPDATE postos
     SET latitude = v_nova_lat,
         longitude = v_nova_lng,
         updated_at = NOW()
   WHERE id = p_id;

  INSERT INTO postos_evento
    (posto_id, evento, ator_id, valores_antes, valores_depois,
     origem_evento, observacao)
  VALUES (
    p_id, 'atualizado', p_ator_id,
    jsonb_build_object('latitude', v_lat_antes, 'longitude', v_lng_antes),
    jsonb_build_object('latitude', v_nova_lat, 'longitude', v_nova_lng),
    p_origem_evento,
    'Coord movida automaticamente para a fronteira mais proxima de "' ||
    v_municipio_alvo || '" (distancia anterior: ' ||
    ROUND(COALESCE(v_distancia_antes_m, 0) / 1000.0, 1)::text || ' km).'
  );

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION mover_coord_para_municipio_declarado IS
  'Move coordenada do posto para o ponto mais proximo dentro do municipio declarado (ST_ClosestPoint contra IBGE). Preserva o vetor da coord original. Trigger automatico recalcula divergencia_municipio depois.';
