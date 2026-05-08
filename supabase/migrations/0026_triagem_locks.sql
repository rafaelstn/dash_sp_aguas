-- =============================================================================
-- Migration 0026 — Tabela `triagem_locks` (lock pessimista de revisão)
-- =============================================================================
-- Quando um aprovador clica em "iniciar revisão", grava-se um lock vivo
-- aqui. UNIQUE em `triagem_id` garante que **só um aprovador por vez** pode
-- estar revisando determinada ficha.
--
-- TTL aprovado pelo Rafael em 2026-05-08: 1 HORA (decisão #5). Coluna
-- `expira_em` é `criado_em + INTERVAL '1 hour'` por default — ajustável por
-- chamada se necessário (extensão futura). Cron passa a cada N minutos
-- removendo locks expirados.
--
-- Estado da ficha em `fichas_triagem.estado` é a fonte primária do ciclo de
-- vida; o lock é APENAS o mutex do passo de revisão. Quando o lock é apagado
-- (manual, decisão final ou TTL), o estado da ficha volta a `pendente` —
-- a transição é responsabilidade do use case (não do trigger), pra manter
-- a regra centralizada na camada de aplicação.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- COMO O CRON DEVE OPERAR (responsabilidade do Rodrigo na Sprint 4):
-- ─────────────────────────────────────────────────────────────────────────────
--   - Periodicidade sugerida: a cada 5 minutos (ainda com TTL de 1h, isso dá
--     no máximo 5min de "lock fantasma" entre expiração real e liberação).
--   - Endpoint: POST /api/cron/liberar-locks-expirados
--     (header `x-cron-secret: $CRON_SECRET` obrigatório)
--   - O endpoint chama o use case `liberarLocksExpirados`, que:
--       1) DELETE FROM triagem_locks WHERE expira_em < NOW() RETURNING ...
--       2) Para cada lock removido, UPDATE fichas_triagem SET estado = 'pendente'
--          WHERE id = X AND estado = 'em_revisao'  (idempotente)
--       3) INSERT em triagem_eventos com evento='lock_expirado'
--     Tudo em sql.begin() — atômico.
--
-- Idempotente. Reversível via DROP TABLE triagem_locks.
-- =============================================================================

CREATE TABLE IF NOT EXISTS triagem_locks (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  triagem_id    UUID         NOT NULL UNIQUE REFERENCES fichas_triagem (id) ON DELETE CASCADE,
  revisor_id    UUID         NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  criado_em     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  expira_em     TIMESTAMPTZ  NOT NULL DEFAULT (NOW() + INTERVAL '1 hour'),

  CONSTRAINT chk_triagem_locks_ttl
    CHECK (expira_em > criado_em)
);

-- Índice principal: cron consulta por `expira_em < NOW()`. Btree default basta.
CREATE INDEX IF NOT EXISTS idx_triagem_locks_expira
  ON triagem_locks (expira_em);

CREATE INDEX IF NOT EXISTS idx_triagem_locks_revisor
  ON triagem_locks (revisor_id, criado_em DESC);

REVOKE UPDATE, DELETE ON triagem_locks FROM PUBLIC;

COMMENT ON TABLE triagem_locks IS
  'Lock pessimista de revisão. UNIQUE(triagem_id) garante 1 aprovador por vez. TTL 1h (decisão Rafael 2026-05-08). Cron de liberação documentado no header da migration.';
