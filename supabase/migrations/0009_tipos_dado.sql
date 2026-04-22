-- =============================================================================
-- Migration 0009 — Tabela `tipos_dado` (seed imutável — 5 categorias oficiais)
-- =============================================================================
-- Enum de tipos de dado por pasta raiz extraído da documentação oficial SPÁguas
-- (22/04/2026). Cada tipo carrega a regex do prefixo esperado para os arquivos
-- daquela pasta. O flag `usa_prefixo_ana` indica que o lookup de prefixo deve
-- ser feito contra `postos.prefixo_ana` em vez de `postos.prefixo`.
-- =============================================================================

CREATE TABLE IF NOT EXISTS tipos_dado (
  codigo           VARCHAR(32) PRIMARY KEY,
  rotulo           TEXT        NOT NULL UNIQUE,
  regex_prefixo    TEXT        NOT NULL,
  usa_prefixo_ana  BOOLEAN     NOT NULL DEFAULT false
);

INSERT INTO tipos_dado (codigo, rotulo, regex_prefixo, usa_prefixo_ana) VALUES
  ('Fluviometria',          'Fluviometria',               '^[0-9][A-Z]-[0-9]{3}$',     false),
  ('FluviometriaANA',       'Fluviometria — ANA',         '^[0-9]{8}$',                true),
  ('FluviometriaQualiAgua', 'Fluviometria — QualiÁgua',   '^[0-9][A-Z]-[0-9]{3}$',     false),
  ('Piezometria',           'Piezometria',                '^[0-9][A-Z]-[0-9]{3}[A-Z]$', false),
  ('Pluviometria',          'Pluviometria',               '^[A-Z][0-9]-[0-9]{3}$',     false),
  ('QualiAgua',             'QualiÁgua',                  '^[A-Z]{4}[0-9]{4,5}$',      false)
ON CONFLICT (codigo) DO UPDATE SET
  rotulo = EXCLUDED.rotulo,
  regex_prefixo = EXCLUDED.regex_prefixo,
  usa_prefixo_ana = EXCLUDED.usa_prefixo_ana;
