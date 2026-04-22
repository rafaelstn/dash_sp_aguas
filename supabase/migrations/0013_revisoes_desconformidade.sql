-- =============================================================================
-- Migration 0013 — Tabela `revisoes_desconformidade`
-- =============================================================================
-- Registra curadoria operacional sobre postos e arquivos desconformes.
-- No MVP, UPDATE em `status`, `nota`, `revisado_em` é permitido (ausência de
-- autenticação torna append-only inviável sem comprometer o fluxo de revisão).
-- Fase 2 aplicará trigger exigindo `usuario_id` e bloqueando edição do histórico.
--
-- Unicidade por (tipo_entidade, id_entidade, categoria) evita duplicação e
-- permite UPSERT simples no POST da API.
-- =============================================================================

CREATE TABLE IF NOT EXISTS revisoes_desconformidade (
  id             UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  tipo_entidade  VARCHAR(16)  NOT NULL,
  id_entidade    TEXT         NOT NULL,
  categoria      VARCHAR(32)  NOT NULL,
  status         VARCHAR(16)  NOT NULL DEFAULT 'pendente',
  nota           TEXT         NULL,
  ip             TEXT         NULL,
  revisado_em    TIMESTAMPTZ  NULL,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_revisao_tipo
    CHECK (tipo_entidade IN ('posto','arquivo')),
  CONSTRAINT chk_revisao_status
    CHECK (status IN ('pendente','revisado')),
  CONSTRAINT chk_revisao_categoria
    CHECK (categoria IN ('PREFIXO_PRINCIPAL','PREFIXO_ANA','ARQUIVO_ORFAO','ARQUIVO_MALFORMADO')),
  CONSTRAINT uq_revisao UNIQUE (tipo_entidade, id_entidade, categoria)
);

CREATE INDEX IF NOT EXISTS idx_revisoes_status
  ON revisoes_desconformidade (status);

CREATE INDEX IF NOT EXISTS idx_revisoes_categoria
  ON revisoes_desconformidade (categoria);

CREATE INDEX IF NOT EXISTS idx_revisoes_entidade
  ON revisoes_desconformidade (tipo_entidade, id_entidade);
