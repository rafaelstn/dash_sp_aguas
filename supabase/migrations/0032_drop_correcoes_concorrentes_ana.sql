-- =============================================================================
-- Migration 0032, drop colunas concorrentes de ana_revisao_estacao.
-- =============================================================================
-- Contexto: decisão Rafael 2026-05-14. Postos é fonte única. As colunas
-- `correcoes` (JSONB) e `justificativa` em ana_revisao_estacao são
-- redundantes / concorrentes:
--
--   - correcoes JSONB armazenava sugestões pendentes de promoção.
--     74 dessas já foram promovidas pra postos (commit b41bf7e).
--     Outras 176 ainda têm dados que precisam ser preservados.
--
--   - justificativa armazenava texto livre do que SPÁguas decidiu.
--     Já tem 131 registros com texto. Vai pra audit trail.
--
-- Esta migration:
--   1. Cria evento de snapshot em ana_revisao_evento pra TODAS estações
--      com correcoes não-vazia OU justificativa preenchida que ainda não
--      foram promovidas pra postos. Audit trail preserva o conteúdo.
--   2. Dropa correcoes e justificativa de ana_revisao_estacao.
--
-- Depois desta migration, o status da estação ANA reflete a decisão; o
-- valor real fica em `postos` (fonte da verdade) ou no audit trail (se
-- ainda não promovido).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Preserva conteúdo das colunas que serão removidas em ana_revisao_evento
-- -----------------------------------------------------------------------------
INSERT INTO ana_revisao_evento (estacao_id, evento, ator_id, valores_antes, observacao)
SELECT
  id,
  'corrigida_manual',
  NULL,
  jsonb_build_object(
    'correcoes', correcoes,
    'justificativa', justificativa,
    'status_pre_drop', status
  ),
  'Snapshot antes do DROP correcoes/justificativa (migration 0032). ' ||
  'Conteudo preservado por LGPD/auditoria. Decisao final esta em postos ' ||
  '(se status=promovida_a_posto) ou pendente revisao humana.'
FROM ana_revisao_estacao
WHERE (correcoes <> '{}'::jsonb OR justificativa IS NOT NULL)
  AND status <> 'promovida_a_posto';

-- -----------------------------------------------------------------------------
-- 2. Drop das colunas concorrentes
-- -----------------------------------------------------------------------------
ALTER TABLE ana_revisao_estacao
  DROP COLUMN IF EXISTS correcoes,
  DROP COLUMN IF EXISTS justificativa;

COMMENT ON TABLE ana_revisao_estacao IS
  'Linha-a-linha do inventario ANA. SNAPSHOT read-only do que a ANA mandou. A verdade vive em postos (FK posto_id). Correcoes historicas em ana_revisao_evento.';
