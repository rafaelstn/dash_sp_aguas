-- =============================================================================
-- Migration 0063, modulo Estoque: itens da conferencia fisica (1 linha por item).
-- =============================================================================
-- Contexto: cada linha e um item conferido, do SNAPSHOT congelado (o esperado no
-- escopo) ou uma SOBRA (contado fora do snapshot, alvo ja cadastrado). Espelha o
-- XOR do ledger (unidade serializada XOR material quantificavel). A divergencia
-- do quantificavel e coluna GENERATED (contada - sistema, congelado no snapshot);
-- a do serializado e categorica, dada por `situacao`. A reconciliacao carimba
-- movimentacao_id/reconciliado_em (chave de idempotencia). Design: ADR 0021 e
-- docs/arquitetura/estoque-conferencia.md.
--
-- Idempotente / reversivel / RLS deny-by-default (padrao 0040/0059).
-- Reversao: DROP TABLE IF EXISTS estoque_conferencia_itens CASCADE;
-- Depende de: 0062 (estoque_conferencias), 0057 (estoque_unidades),
--             0056 (estoque_materiais), 0054 (estoque_locais), 0059 (estoque_movimentacoes).
-- =============================================================================

CREATE TABLE IF NOT EXISTS estoque_conferencia_itens (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  conferencia_id       UUID         NOT NULL REFERENCES estoque_conferencias (id) ON DELETE CASCADE,
  -- XOR de alvo, espelha ck_estoque_mov_alvo do ledger.
  unidade_id           UUID         NULL REFERENCES estoque_unidades (id) ON DELETE RESTRICT,
  material_id          UUID         NULL REFERENCES estoque_materiais (id) ON DELETE RESTRICT,
  -- contexto CONGELADO no snapshot
  local_esperado_id    UUID         NULL REFERENCES estoque_locais (id) ON DELETE SET NULL,
  tamanho              TEXT         NULL,   -- bucket do quantificavel (bitola etc.)
  origem               TEXT         NOT NULL DEFAULT 'snapshot' CHECK (origem IN ('snapshot', 'sobra')),
  -- serializado: contagem categorica
  situacao             TEXT         NULL CHECK (situacao IN ('pendente', 'conferido', 'nao_encontrado', 'encontrado_em_outro_local')),
  local_encontrado_id  UUID         NULL REFERENCES estoque_locais (id) ON DELETE SET NULL,
  -- quantificavel: quantidade_sistema CONGELADA no snapshot; contada preenchida pelo almoxarife
  quantidade_sistema   INTEGER      NULL CHECK (quantidade_sistema IS NULL OR quantidade_sistema >= 0),
  quantidade_contada   INTEGER      NULL CHECK (quantidade_contada IS NULL OR quantidade_contada >= 0),
  -- diferenca congelada: contada - sistema (Postgres GENERATED STORED; null enquanto nao contado).
  diferenca            INTEGER      GENERATED ALWAYS AS (quantidade_contada - quantidade_sistema) STORED,
  observacao           TEXT         NULL,
  -- reconciliacao (trilha)
  movimentacao_id      UUID         NULL REFERENCES estoque_movimentacoes (id) ON DELETE SET NULL,
  reconciliado_por     UUID         NULL,
  reconciliado_em      TIMESTAMPTZ  NULL,
  criado_em            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  atualizado_em        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  -- exatamente um alvo (serializado XOR quantificavel)
  CONSTRAINT ck_estoque_conf_item_alvo CHECK (
    (unidade_id IS NOT NULL AND material_id IS NULL) OR
    (unidade_id IS NULL AND material_id IS NOT NULL)
  ),
  -- serializado usa situacao; quantificavel usa quantidade_sistema. Mantem o
  -- modelo coerente (mesma tabela, dois formatos, guardados como no ledger).
  CONSTRAINT ck_estoque_conf_item_natureza CHECK (
    (unidade_id  IS NOT NULL AND situacao IS NOT NULL AND quantidade_sistema IS NULL) OR
    (material_id IS NOT NULL AND quantidade_sistema IS NOT NULL AND situacao IS NULL)
  ),
  -- carimbo de reconciliacao coerente
  CONSTRAINT ck_estoque_conf_item_recon CHECK (
    reconciliado_em IS NULL OR reconciliado_por IS NOT NULL
  )
);

COMMENT ON TABLE estoque_conferencia_itens IS
  'Item conferido: snapshot congelado (quantidade_sistema / local_esperado) x contagem fisica. Divergencia derivada. Reconciliacao carimba movimentacao_id (idempotencia). ADR 0021.';

-- Nao duplica o mesmo alvo dentro da conferencia (snapshot nem sobra repetida).
CREATE UNIQUE INDEX IF NOT EXISTS uq_estoque_conf_item_unidade
  ON estoque_conferencia_itens (conferencia_id, unidade_id) WHERE unidade_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_estoque_conf_item_material
  ON estoque_conferencia_itens (conferencia_id, material_id,
       COALESCE(local_esperado_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(tamanho, ''))
  WHERE material_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_estoque_conf_item_conf
  ON estoque_conferencia_itens (conferencia_id);
-- pendencias de reconciliacao (parcial): acelera "quantos itens faltam tratar".
CREATE INDEX IF NOT EXISTS idx_estoque_conf_item_pendentes
  ON estoque_conferencia_itens (conferencia_id) WHERE reconciliado_em IS NULL;

ALTER TABLE IF EXISTS estoque_conferencia_itens ENABLE ROW LEVEL SECURITY;
