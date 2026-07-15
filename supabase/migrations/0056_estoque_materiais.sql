-- =============================================================================
-- Migration 0056, modulo Estoque, catalogo de materiais ("o que e").
-- =============================================================================
-- Contexto: catalogo das duas naturezas (serializado e quantificavel), com
-- coluna `natureza`. Para quantificavel o material_id e a identidade (o saldo
-- vive em estoque_saldos por material+local). Para serializado o vinculo e
-- OPCIONAL (agrupamento best-effort do import; a unidade se descreve sozinha).
-- Design: ADR 0020 §2 e docs/arquitetura/modulo-estoque.md.
--
-- Soft-inativar (coluna `ativo`) em vez de apagar: governo/auditoria. O DELETE
-- da API inativa quando ha vinculo (unidade/saldo/movimentacao).
--
-- Idempotente / reversivel / RLS deny-by-default (padrao 0040/0045).
-- Depende de: 0055 (estoque_categorias).
-- =============================================================================

CREATE TABLE IF NOT EXISTS estoque_materiais (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  descricao      TEXT         NOT NULL,
  marca          TEXT         NULL,
  modelo         TEXT         NULL,
  natureza       TEXT         NOT NULL CHECK (natureza IN ('serializado', 'quantificavel')),
  unidade_medida TEXT         NULL,   -- ex. 'un', 'm', 'par'; relevante para quantificavel
  categoria_id   UUID         NULL REFERENCES estoque_categorias (id) ON DELETE SET NULL,
  ativo          BOOLEAN      NOT NULL DEFAULT TRUE,  -- soft-inativar (governo/auditoria)
  criado_em      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  atualizado_em  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE estoque_materiais IS
  'Catalogo de materiais do estoque (serializado e quantificavel). ativo=soft-inativar. Dedup best-effort do import por (natureza, descricao, marca, modelo).';

-- dedup do import (best-effort): mesmo material logico nao duplica.
CREATE UNIQUE INDEX IF NOT EXISTS uq_estoque_materiais_dedup
  ON estoque_materiais (natureza, lower(descricao), lower(COALESCE(marca, '')), lower(COALESCE(modelo, '')));

CREATE INDEX IF NOT EXISTS idx_estoque_materiais_categoria
  ON estoque_materiais (categoria_id) WHERE categoria_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_estoque_materiais_natureza
  ON estoque_materiais (natureza);

ALTER TABLE IF EXISTS estoque_materiais ENABLE ROW LEVEL SECURITY;
