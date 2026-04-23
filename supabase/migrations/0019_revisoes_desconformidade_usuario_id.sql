-- =============================================================================
-- Migration 0019 — `usuario_id` em `revisoes_desconformidade`
-- =============================================================================
-- Contexto: a US-008 (autenticação) foi antecipada pra Fase 1 via Supabase Auth
-- (ver ADR-0004), condição necessária pra expor o dashboard na Vercel sem
-- violar a pré-condição de deploy em rede interna.
--
-- Com auth habilitada, a revisão de desconformidade deixa de depender apenas
-- de IP pra identificação: passa a gravar também o `usuario_id` (UUID do
-- Supabase Auth, TEXT por portabilidade a outros provedores).
-- `ip` permanece como dado complementar, útil em auditoria forense.
--
-- Idempotente via IF NOT EXISTS.
-- =============================================================================

ALTER TABLE revisoes_desconformidade
  ADD COLUMN IF NOT EXISTS usuario_id TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_revisoes_usuario
  ON revisoes_desconformidade (usuario_id)
  WHERE usuario_id IS NOT NULL;

COMMENT ON COLUMN revisoes_desconformidade.usuario_id IS
  'UUID do usuário autenticado via Supabase Auth que marcou a desconformidade como revisada. NULL quando gravada antes da ativação da US-008 (ver ADR-0004).';
