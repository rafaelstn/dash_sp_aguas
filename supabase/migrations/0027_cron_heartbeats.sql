-- =============================================================================
-- Migration 0027 — Tabela `cron_heartbeats` (sinal de vida dos jobs cron)
-- =============================================================================
-- Cada job cron registra UMA linha por execução de sucesso. O alerta A3
-- (`docs/runbooks/alertas-siem.md`) verifica ausência de heartbeat por
-- mais de 10min do job `triagem-liberar-locks-expirados`.
--
-- Decisão (Rodrigo, Sprint 1.S3): heartbeat em Postgres em vez de serviço
-- externo (UptimeRobot, BetterStack) porque:
--   1. Custo zero adicional — Supabase já está no stack.
--   2. Operações 100% no nosso domínio (sem credencial extra pra rotacionar).
--   3. Query simples (`SELECT max(ocorreu_em)`) basta pro alerta —
--      monitor pode rodar dentro do próprio /api/health (Sprint 2).
--   4. Audit trail interno (governo SP) — registro fica no DB que já é
--      backupeado pelo Supabase (PITR).
--
-- Reabrir migração pra serviço externo SE:
--   - Supabase ficar fora >5min → não dá pra confiar no próprio DB pra
--     observar saúde (auto-referência circular).
--   Resposta atual: alerta A3 dispara em "ausência de heartbeat", então
--   Supabase down também derruba o cron — alerta cobre os dois cenários.
--
-- ESTRATÉGIA DE RETENÇÃO
--   - Mantém só os últimos 7 dias (10080 minutos) — registros antigos
--     não têm valor operacional (alerta olha janela de 10min).
--   - Limpeza preguiçosa: DELETE WHERE ocorreu_em < NOW() - INTERVAL '7 days'
--     pode rodar dentro do próprio cron (1 query barata por execução).
--   - Cap de tamanho: ~288 linhas por dia (a cada 5min) × 7 dias × N jobs
--     = ~2k linhas. Não cresce.
--
-- IDEMPOTÊNCIA
--   - Não há UNIQUE constraint forçando 1 linha por execução. Se o cron
--     rodar duas vezes (retry da Vercel), grava 2 heartbeats — alerta
--     usa MAX(ocorreu_em), não COUNT.
--
-- Idempotente. Reversível via DROP TABLE cron_heartbeats.
-- =============================================================================

CREATE TABLE IF NOT EXISTS cron_heartbeats (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  job           VARCHAR(64)  NOT NULL,
  ocorreu_em    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  duracao_ms    INTEGER      NULL,
  -- contexto: { quantidade: N } para o job de locks, ou outras métricas.
  payload       JSONB        NULL,

  CONSTRAINT chk_cron_heartbeats_job
    CHECK (job IN (
      'triagem-liberar-locks-expirados'
    ))
);

-- Índice principal: alerta consulta MAX(ocorreu_em) WHERE job = X.
CREATE INDEX IF NOT EXISTS idx_cron_heartbeats_job_recente
  ON cron_heartbeats (job, ocorreu_em DESC);

-- Append-only — só backend grava. Toda mutação manual deve ir pelo painel
-- Supabase com service role (audit log do Supabase registra).
REVOKE UPDATE, DELETE ON cron_heartbeats FROM PUBLIC;

COMMENT ON TABLE cron_heartbeats IS
  'Sinal de vida dos jobs cron. Alerta A3 (alertas-siem.md) verifica ausência. Retenção operacional 7 dias — limpeza pelo próprio cron.';
