-- =============================================================================
-- Migration 0005 — Tabela `acesso_ficha` (trilha de auditoria LGPD, append-only)
-- =============================================================================
-- `usuario_id` é nullable no MVP porque autenticação é Fase 2.
-- `ip`, `user_agent` e `prefixo` sustentam a trilha mesmo sem auth.
-- =============================================================================

CREATE TABLE IF NOT EXISTS acesso_ficha (
  id                UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  usuario_id        TEXT          NULL,
  prefixo           VARCHAR(32)   NOT NULL,
  acao              VARCHAR(32)   NOT NULL,
  ip                TEXT          NULL,
  user_agent        TEXT          NULL,
  ocorreu_em        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_acesso_acao
    CHECK (acao IN ('visualizou_ficha', 'listou_arquivos'))
);

CREATE INDEX IF NOT EXISTS idx_acesso_usuario
  ON acesso_ficha (usuario_id, ocorreu_em DESC);

CREATE INDEX IF NOT EXISTS idx_acesso_prefixo
  ON acesso_ficha (prefixo, ocorreu_em DESC);

CREATE INDEX IF NOT EXISTS idx_acesso_ocorreu_em
  ON acesso_ficha (ocorreu_em DESC);

-- Append-only no nível de permissão: role de aplicação deve ter INSERT, mas
-- não UPDATE nem DELETE nesta tabela. Definir permissões na role "app":
--
--   REVOKE UPDATE, DELETE ON acesso_ficha FROM PUBLIC;
--   GRANT INSERT, SELECT ON acesso_ficha TO app;
--
-- A aplicação nunca faz SELECT nesta tabela — quem consulta é DBA.
