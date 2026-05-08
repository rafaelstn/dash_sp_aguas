-- =============================================================================
-- Migration 0025 — Tabela `triagem_eventos` (audit trail append-only)
-- =============================================================================
-- Toda transição de estado em `fichas_triagem` gera linha aqui, na MESMA
-- transação da operação principal (ver use cases /aplicação/triagem/*).
--
-- Append-only por convenção + REVOKE UPDATE/DELETE — mesmo padrão da tabela
-- `acesso_ficha` da Fase 1 (LGPD + governança). Ver ADR-0008 §2.2.
--
-- Idempotente. Reversível via DROP TABLE triagem_eventos.
-- =============================================================================

CREATE TABLE IF NOT EXISTS triagem_eventos (
  id              UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  triagem_id      UUID         NOT NULL REFERENCES fichas_triagem (id) ON DELETE RESTRICT,
  evento          VARCHAR(32)  NOT NULL,
  estado_anterior VARCHAR(16)  NULL,
  estado_novo     VARCHAR(16)  NULL,
  ator_id         UUID         NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  motivo          TEXT         NULL,
  payload         JSONB        NULL,        -- contexto extra (ex.: idempotency_key, ficha_origem_id)
  ip              INET         NULL,
  user_agent      TEXT         NULL,
  ocorreu_em      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_triagem_eventos_evento
    CHECK (evento IN (
      'submetida',
      'reenvio_apos_devolucao',
      'revisao_iniciada',
      'revisao_liberada',     -- aprovador cancelou (manual)
      'lock_expirado',        -- TTL liberou (cron)
      'aprovada',
      'rejeitada',
      'devolvida'
    ))
);

CREATE INDEX IF NOT EXISTS idx_triagem_eventos_triagem
  ON triagem_eventos (triagem_id, ocorreu_em DESC);

CREATE INDEX IF NOT EXISTS idx_triagem_eventos_ator
  ON triagem_eventos (ator_id, ocorreu_em DESC)
  WHERE ator_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_triagem_eventos_evento_data
  ON triagem_eventos (evento, ocorreu_em DESC);

REVOKE UPDATE, DELETE ON triagem_eventos FROM PUBLIC;

COMMENT ON TABLE triagem_eventos IS
  'Audit trail append-only de transições em fichas_triagem. UPDATE/DELETE bloqueados via REVOKE — manipulação direta no banco sai como tentativa de adulteração de auditoria.';
