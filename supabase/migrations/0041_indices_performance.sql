-- =============================================================================
-- Migration 0041, índices de performance identificados na auditoria
-- pré compartilhamento (2026-05-18).
-- =============================================================================
-- Contexto: a auditoria mediu duas filas de query frequentes sem índice
-- adequado:
--
--   1. Lookup de posto por `prefixo_ana` (em JOIN com `ana_revisao_estacao`
--      e em fallback do script SharePoint, ~2371 lookups por execução).
--      FTS via `busca_tsv` (migration 0014) não cobre lookup exato.
--
--   2. Listagem da tela de revisão ANA, que filtra por
--      `(lote_id, divergencia_municipio, operando)` e ordena pelos mesmos.
--      Índices existentes (`idx_ana_revisao_estacao_lote_status`,
--      `idx_ana_revisao_estacao_divergencia`) cobrem partes, mas o ORDER BY
--      composto cai em sort em memória.
--
-- Idempotente: IF NOT EXISTS. Reversível: DROP INDEX IF EXISTS.
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_postos_prefixo_ana
  ON postos (prefixo_ana)
  WHERE prefixo_ana IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ana_revisao_estacao_lote_divergencia_operando
  ON ana_revisao_estacao (lote_id, divergencia_municipio, operando);
