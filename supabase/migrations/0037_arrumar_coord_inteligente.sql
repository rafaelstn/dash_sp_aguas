-- =============================================================================
-- Migration 0037, funcao arrumar_coord_inteligente_posto.
-- =============================================================================
-- Caso real Rafael 2026-05-14 (F4-047 PEREIRINHA):
--   municipio = TAPIRAI (756 km2)
--   municipio_alt = Sete Barras (1063 km2)
--   coord atual (-24.1167, -47.92) caia fora de TAPIRAI mas dentro de
--   Sete Barras (ou na borda).
--
-- A logica anterior (mover_coord_para_municipio_declarado) so olhava
-- pra `municipio`, ignorando `municipio_alt`. Resultado: F4-047 era
-- movido pra fronteira de Tapirai, perdendo o municipio real (Sete
-- Barras).
--
-- Nova logica:
--   1. Gera candidatos: municipio + municipio_alt (se diferentes).
--   2. Pra cada candidato, calcula distancia do ponto ao poligono.
--   3. Escolhe o de menor distancia (dentro = 0).
--   4. Se ponto cai dentro de algum candidato:
--      - Atualiza postos.municipio para o candidato escolhido (caso
--        o alt fosse o correto).
--      - Mantem a coord.
--      - Audit "validado_dentro_alt" se trocou o municipio.
--   5. Se nao cai em nenhum:
--      - Move coord para ST_ClosestPoint do candidato mais proximo.
--      - Atualiza postos.municipio para esse candidato.
--      - Audit "movida_para_candidato_mais_proximo".
--
-- Retorna texto descrevendo a acao tomada.
-- =============================================================================

CREATE OR REPLACE FUNCTION arrumar_coord_inteligente_posto(
  p_id UUID,
  p_ator_id UUID DEFAULT NULL
)
RETURNS TEXT AS $$
DECLARE
  v_geom              geometry;
  v_municipio_decl    TEXT;
  v_municipio_alt     TEXT;
  v_lat_antes         NUMERIC;
  v_lng_antes         NUMERIC;
  -- Candidatos
  v_decl_codigo       CHAR(7);
  v_decl_nome         TEXT;
  v_decl_dist_m       NUMERIC;
  v_decl_dentro       BOOLEAN;
  v_decl_pt           geometry;
  v_alt_codigo        CHAR(7);
  v_alt_nome          TEXT;
  v_alt_dist_m        NUMERIC;
  v_alt_dentro        BOOLEAN;
  v_alt_pt            geometry;
  -- Escolhido
  v_escolhido_nome    TEXT;
  v_escolhido_codigo  CHAR(7);
  v_escolhido_pt      geometry;
  v_escolhido_dentro  BOOLEAN;
  v_acao              TEXT;
  v_nova_lat          NUMERIC;
  v_nova_lng          NUMERIC;
  v_observacao        TEXT;
BEGIN
  SELECT geom, municipio, municipio_alt, latitude, longitude
    INTO v_geom, v_municipio_decl, v_municipio_alt, v_lat_antes, v_lng_antes
    FROM postos WHERE id = p_id AND deleted_at IS NULL;

  IF v_geom IS NULL THEN
    RETURN 'sem_coordenada';
  END IF;
  IF v_municipio_decl IS NULL AND v_municipio_alt IS NULL THEN
    RETURN 'sem_municipio_declarado';
  END IF;

  -- Candidato 1: municipio declarado
  IF v_municipio_decl IS NOT NULL THEN
    SELECT m.codigo_ibge, m.nome,
           ST_Distance(m.geom::geography, v_geom::geography),
           ST_Contains(m.geom, v_geom),
           ST_ClosestPoint(m.geom, v_geom)
      INTO v_decl_codigo, v_decl_nome, v_decl_dist_m, v_decl_dentro, v_decl_pt
      FROM ibge_municipios_sp m
     WHERE LOWER(unaccent(m.nome)) = LOWER(unaccent(v_municipio_decl))
     LIMIT 1;
  END IF;

  -- Candidato 2: municipio_alt (se existir e for diferente)
  IF v_municipio_alt IS NOT NULL
     AND LOWER(unaccent(v_municipio_alt)) <> LOWER(unaccent(COALESCE(v_municipio_decl, ''))) THEN
    SELECT m.codigo_ibge, m.nome,
           ST_Distance(m.geom::geography, v_geom::geography),
           ST_Contains(m.geom, v_geom),
           ST_ClosestPoint(m.geom, v_geom)
      INTO v_alt_codigo, v_alt_nome, v_alt_dist_m, v_alt_dentro, v_alt_pt
      FROM ibge_municipios_sp m
     WHERE LOWER(unaccent(m.nome)) = LOWER(unaccent(v_municipio_alt))
     LIMIT 1;
  END IF;

  -- Nenhum candidato encontrou municipio no IBGE
  IF v_decl_codigo IS NULL AND v_alt_codigo IS NULL THEN
    RETURN 'sem_match_ibge';
  END IF;

  -- Decisao: 4 cenarios
  -- A) Decl contem ponto                       -> mantem tudo, classifica ok
  -- B) Alt contem ponto                        -> troca municipio pelo alt, mantem coord
  -- C) Nenhum contem mas decl mais proximo     -> move coord pra fronteira do decl
  -- D) Nenhum contem mas alt mais proximo      -> move coord + troca municipio pelo alt

  IF v_decl_dentro IS TRUE THEN
    v_escolhido_nome := v_decl_nome;
    v_escolhido_codigo := v_decl_codigo;
    v_escolhido_pt := v_geom; -- mantem
    v_escolhido_dentro := TRUE;
    v_acao := 'mantido_dentro_municipio_declarado';
  ELSIF v_alt_dentro IS TRUE THEN
    v_escolhido_nome := v_alt_nome;
    v_escolhido_codigo := v_alt_codigo;
    v_escolhido_pt := v_geom; -- mantem coord
    v_escolhido_dentro := TRUE;
    v_acao := 'validado_dentro_municipio_alt';
  ELSE
    -- Compara distancias (NULL = infinito)
    IF v_decl_dist_m IS NOT NULL
       AND (v_alt_dist_m IS NULL OR v_decl_dist_m <= v_alt_dist_m) THEN
      v_escolhido_nome := v_decl_nome;
      v_escolhido_codigo := v_decl_codigo;
      v_escolhido_pt := v_decl_pt;
      v_escolhido_dentro := FALSE;
      v_acao := 'movida_para_fronteira_municipio_declarado';
    ELSE
      v_escolhido_nome := v_alt_nome;
      v_escolhido_codigo := v_alt_codigo;
      v_escolhido_pt := v_alt_pt;
      v_escolhido_dentro := FALSE;
      v_acao := 'movida_para_fronteira_municipio_alt';
    END IF;
  END IF;

  v_nova_lat := ST_Y(v_escolhido_pt);
  v_nova_lng := ST_X(v_escolhido_pt);

  v_observacao := format(
    'Acao=%s | municipio escolhido=%s | coord antes=(%s, %s) | coord depois=(%s, %s) | candidatos: decl=%s/%s dentro=%s, alt=%s/%s dentro=%s',
    v_acao, v_escolhido_nome,
    v_lat_antes, v_lng_antes, v_nova_lat, v_nova_lng,
    v_municipio_decl, COALESCE(round(v_decl_dist_m::numeric/1000, 2)::text, '-'),
    COALESCE(v_decl_dentro::text, '-'),
    v_municipio_alt, COALESCE(round(v_alt_dist_m::numeric/1000, 2)::text, '-'),
    COALESCE(v_alt_dentro::text, '-')
  );

  -- Aplica via UPDATE direto (sem trigger pra evitar invalidacao
  -- circular; trigger reage só a mudança coming do usuario na UI).
  UPDATE postos
     SET latitude = v_nova_lat,
         longitude = v_nova_lng,
         geom = v_escolhido_pt,
         municipio = v_escolhido_nome,
         updated_at = NOW(),
         analise_geo_em = NULL  -- forca re-classificacao
   WHERE id = p_id;

  -- Audit
  INSERT INTO postos_evento (
    posto_id, evento, ator_id, valores_antes, valores_depois,
    origem_evento, observacao
  ) VALUES (
    p_id, 'corrigido_em_lote', p_ator_id,
    jsonb_build_object(
      'latitude', v_lat_antes,
      'longitude', v_lng_antes,
      'municipio', v_municipio_decl,
      'municipio_alt', v_municipio_alt
    ),
    jsonb_build_object(
      'latitude', v_nova_lat,
      'longitude', v_nova_lng,
      'municipio', v_escolhido_nome,
      'acao', v_acao
    ),
    'arrumar_coord_inteligente',
    v_observacao
  );

  RETURN v_acao;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION arrumar_coord_inteligente_posto IS
  'Para 1 posto: escolhe entre municipio e municipio_alt o mais provavel (que contem o ponto OU o mais proximo). Move coord se necessario. Atualiza postos.municipio se o alt for o correto. Audit em postos_evento.';
