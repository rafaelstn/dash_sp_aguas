-- =============================================================================
-- Migration 0062, modulo Estoque: conferencia fisica (inventario), a SESSAO.
-- =============================================================================
-- Contexto: o almoxarife faz a contagem fisica do estoque; a sessao de
-- conferencia escopa UMA natureza (serializado OU quantificavel) por unidade
-- fisica (PENHA/ARARAQUARA) e, opcionalmente, um local. O esperado e congelado
-- num snapshot (tabela 0063) no momento de abrir. Design: ADR 0021 e
-- docs/arquitetura/estoque-conferencia.md.
--
-- Reconciliacao reusa o ledger (0059): o ajuste de inventario e uma movimentacao
-- carimbada com conferencia_id (coluna adicionada na 0064).
--
-- Idempotente / reversivel / RLS deny-by-default (padrao 0040/0059).
-- Reversao: DROP TABLE IF EXISTS estoque_conferencias CASCADE;
-- Depende de: 0054 (estoque_locais).
-- =============================================================================

CREATE TABLE IF NOT EXISTS estoque_conferencias (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade        TEXT         NOT NULL CHECK (unidade IN ('PENHA', 'ARARAQUARA')),
  natureza       TEXT         NOT NULL CHECK (natureza IN ('serializado', 'quantificavel')),
  local_id       UUID         NULL REFERENCES estoque_locais (id) ON DELETE RESTRICT,  -- escopo opcional
  status         TEXT         NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'concluida', 'cancelada')),
  observacao     TEXT         NULL,
  criada_por     UUID         NOT NULL,   -- auth do backend (nunca do corpo)
  criada_em      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  concluida_por  UUID         NULL,
  concluida_em   TIMESTAMPTZ  NULL,
  atualizada_em  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  -- coerencia: sessao concluida tem quem/quando
  CONSTRAINT ck_estoque_conf_concluida CHECK (
    status <> 'concluida' OR (concluida_por IS NOT NULL AND concluida_em IS NOT NULL)
  )
);

COMMENT ON TABLE estoque_conferencias IS
  'Sessao de conferencia fisica (inventario). Escopo = unidade + natureza + local opcional. Snapshot congelado nos itens. Design: ADR 0021.';

-- No maximo 1 conferencia ABERTA por escopo (evita contagens concorrentes no
-- mesmo local/natureza). COALESCE do local_id para o UUID zero permite indexar
-- o caso "sem local" (escopo = unidade fisica inteira).
CREATE UNIQUE INDEX IF NOT EXISTS uq_estoque_conf_aberta_escopo
  ON estoque_conferencias (unidade, natureza, COALESCE(local_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status = 'aberta';

CREATE INDEX IF NOT EXISTS idx_estoque_conf_status
  ON estoque_conferencias (status, criada_em DESC);

ALTER TABLE IF EXISTS estoque_conferencias ENABLE ROW LEVEL SECURITY;
