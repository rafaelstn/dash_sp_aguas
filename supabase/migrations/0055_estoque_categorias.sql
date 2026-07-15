-- =============================================================================
-- Migration 0055, modulo Estoque, tabela de categorias (classificacao opcional).
-- =============================================================================
-- Contexto: classificacao opcional do catalogo (estoque_materiais.categoria_id
-- REFERENCES ... ON DELETE SET NULL). Nao e obrigatoria para nenhuma natureza;
-- serve para agrupar/filtrar o catalogo nas telas. Design: ADR 0020.
--
-- Idempotente: CREATE TABLE / CREATE INDEX IF NOT EXISTS.
-- Reversivel: DROP TABLE IF EXISTS estoque_categorias.
-- RLS deny-by-default (padrao 0040/0045).
-- =============================================================================

CREATE TABLE IF NOT EXISTS estoque_categorias (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       TEXT         NOT NULL,
  criado_em  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE estoque_categorias IS
  'Classificacao opcional do catalogo de materiais do estoque. Nome unico case-insensitive.';

-- nome unico ignorando caixa (nao duplica "Cabos" e "cabos").
CREATE UNIQUE INDEX IF NOT EXISTS uq_estoque_categorias_nome
  ON estoque_categorias (lower(nome));

ALTER TABLE IF EXISTS estoque_categorias ENABLE ROW LEVEL SECURITY;
