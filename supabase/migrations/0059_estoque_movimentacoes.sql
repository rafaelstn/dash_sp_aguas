-- =============================================================================
-- Migration 0059, modulo Estoque, ledger / trilha de auditoria.
-- =============================================================================
-- Contexto: registra TODA movimentacao (entrada, saida, transferencia, baixa,
-- ajuste) com trilha de auditoria (quem, quando, quantidade, de/para, motivo,
-- snapshots de estado/status). E a verdade de auditoria (append-only): correcao
-- NUNCA sobrescreve linha; gera nova movimentacao `ajuste` com motivo. Design:
-- ADR 0020 §2.3/§2.5 e docs/arquitetura/modulo-estoque.md.
--
-- XOR: movimentacao referencia OU uma unidade (serializado) OU um material
-- (quantificavel), nunca os dois (CHECK ck_estoque_mov_alvo).
--
-- Idempotente / reversivel / RLS deny-by-default (padrao 0040/0045).
-- Depende de: 0057 (estoque_unidades), 0056 (estoque_materiais), 0054 (estoque_locais).
-- =============================================================================

CREATE TABLE IF NOT EXISTS estoque_movimentacoes (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo            TEXT         NOT NULL CHECK (tipo IN ('entrada', 'saida', 'transferencia', 'baixa', 'ajuste')),
  -- XOR: serializado referencia unidade; quantificavel referencia material.
  unidade_id      UUID         NULL REFERENCES estoque_unidades (id) ON DELETE RESTRICT,
  material_id     UUID         NULL REFERENCES estoque_materiais (id) ON DELETE RESTRICT,
  quantidade      INTEGER      NOT NULL DEFAULT 1 CHECK (quantidade >= 1),  -- serializado sempre 1
  local_origem    UUID         NULL REFERENCES estoque_locais (id) ON DELETE SET NULL,
  local_destino   UUID         NULL REFERENCES estoque_locais (id) ON DELETE SET NULL,
  estado_anterior TEXT         NULL,   -- snapshot para auditoria (serializado)
  estado_novo     TEXT         NULL,
  status_anterior TEXT         NULL,
  status_novo     TEXT         NULL,
  motivo          TEXT         NULL,    -- obrigatorio para baixa e ajuste (validado na aplicacao)
  usuario_id      UUID         NOT NULL,  -- quem fez (auth do backend, nunca do corpo)
  criado_em       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  -- exatamente um alvo (serializado XOR quantificavel)
  CONSTRAINT ck_estoque_mov_alvo CHECK (
    (unidade_id IS NOT NULL AND material_id IS NULL) OR
    (unidade_id IS NULL AND material_id IS NOT NULL)
  ),
  -- transferencia exige origem e destino distintos
  CONSTRAINT ck_estoque_mov_transf CHECK (
    tipo <> 'transferencia' OR
    (local_origem IS NOT NULL AND local_destino IS NOT NULL AND local_origem <> local_destino)
  )
);

COMMENT ON TABLE estoque_movimentacoes IS
  'Ledger append-only do estoque (trilha de auditoria). XOR unidade/material. Correcao vira nova linha `ajuste` com motivo; sem UPDATE/DELETE pelo app.';

CREATE INDEX IF NOT EXISTS idx_estoque_mov_unidade
  ON estoque_movimentacoes (unidade_id, criado_em DESC) WHERE unidade_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_estoque_mov_material
  ON estoque_movimentacoes (material_id, criado_em DESC) WHERE material_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_estoque_mov_tipo
  ON estoque_movimentacoes (tipo, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_estoque_mov_usuario
  ON estoque_movimentacoes (usuario_id, criado_em DESC);

ALTER TABLE IF EXISTS estoque_movimentacoes ENABLE ROW LEVEL SECURITY;
