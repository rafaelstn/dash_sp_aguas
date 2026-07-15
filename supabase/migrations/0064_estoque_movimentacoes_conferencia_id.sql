-- =============================================================================
-- Migration 0064, modulo Estoque: amarra a movimentacao a conferencia que a gerou.
-- =============================================================================
-- Contexto: a reconciliacao de uma divergencia gera uma movimentacao normal
-- (entrada/saida/transferencia) no ledger, carimbada com a conferencia de origem
-- para rastreabilidade de auditoria (governo). FK nullable e ADITIVA: nao muda
-- nenhuma linha existente. Design: ADR 0021 e docs/arquitetura/estoque-conferencia.md.
--
-- ATENCAO (aprendizado do projeto): esta e COLUNA NOVA em tabela EXISTENTE com
-- dados. O ledger (.pg) le por lista EXPLICITA de colunas (COLUNAS_MOV); a coluna
-- so passa a ser lida quando entra nessa lista, o que acontece junto com o codigo
-- da reconciliacao. Ordem de deploy OBRIGATORIA: 1) aplicar 0062-0064 no banco,
-- 2) confirmar via information_schema, 3) SO ENTAO push do codigo. Migration
-- commitada != aplicada.
--
-- Aditiva, idempotente (ADD COLUMN IF NOT EXISTS), reversivel.
-- Reversao: ALTER TABLE estoque_movimentacoes DROP COLUMN IF EXISTS conferencia_id;
-- Depende de: 0059 (estoque_movimentacoes), 0062 (estoque_conferencias).
-- =============================================================================

ALTER TABLE IF EXISTS estoque_movimentacoes
  ADD COLUMN IF NOT EXISTS conferencia_id UUID NULL REFERENCES estoque_conferencias (id) ON DELETE SET NULL;

COMMENT ON COLUMN estoque_movimentacoes.conferencia_id IS
  'Preenchido quando a movimentacao foi gerada por reconciliacao de conferencia (rastreabilidade de auditoria).';

CREATE INDEX IF NOT EXISTS idx_estoque_mov_conferencia
  ON estoque_movimentacoes (conferencia_id) WHERE conferencia_id IS NOT NULL;
