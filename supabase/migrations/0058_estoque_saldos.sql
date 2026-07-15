-- =============================================================================
-- Migration 0058, modulo Estoque, saldos de quantificaveis (saldo MANTIDO).
-- =============================================================================
-- Contexto: para quantificaveis (cabos, antenas, placas solares...) o saldo e
-- MATERIALIZADO por (material, local, tamanho) e atualizado na MESMA transacao
-- da movimentacao. Nao-negativo garantido pelo banco (CHECK) + UPDATE guardado
-- atomico no repositorio. Design: ADR 0020 (decisao central) e §2.5.
--
-- O ledger (estoque_movimentacoes) continua a verdade de auditoria; este saldo e
-- projecao reconciliavel por SUM do ledger (conciliar-saldos).
--
-- Idempotente / reversivel / RLS deny-by-default (padrao 0040/0045).
-- Depende de: 0056 (estoque_materiais), 0054 (estoque_locais).
-- =============================================================================

CREATE TABLE IF NOT EXISTS estoque_saldos (
  id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id   UUID         NOT NULL REFERENCES estoque_materiais (id) ON DELETE RESTRICT,
  local_id      UUID         NOT NULL REFERENCES estoque_locais (id) ON DELETE RESTRICT,
  quantidade    INTEGER      NOT NULL DEFAULT 0 CHECK (quantidade >= 0),  -- nao-negativo garantido pelo banco
  tamanho       TEXT         NULL,   -- TAMANHO da planilha quantificavel (ex. bitola de cabo)
  atualizado_em TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE estoque_saldos IS
  'Saldo MANTIDO de quantificaveis por (material, local, tamanho). CHECK(quantidade>=0) + UPDATE guardado garantem nao-negativo. Reconciliavel por SUM do ledger.';

-- 1 saldo por (material, local, tamanho): chave do upsert transacional.
-- COALESCE(tamanho,'') espelha a chave usada no ON CONFLICT do repositorio/import.
CREATE UNIQUE INDEX IF NOT EXISTS uq_estoque_saldos_material_local
  ON estoque_saldos (material_id, local_id, COALESCE(tamanho, ''));

CREATE INDEX IF NOT EXISTS idx_estoque_saldos_local
  ON estoque_saldos (local_id);

ALTER TABLE IF EXISTS estoque_saldos ENABLE ROW LEVEL SECURITY;
