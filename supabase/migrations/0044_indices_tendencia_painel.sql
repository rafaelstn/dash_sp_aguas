-- =============================================================================
-- Migration 0044, índices para as séries temporais de tendência do painel.
-- =============================================================================
-- Contexto: o painel (/painel) passou a exibir tendência nos cards de KPI
-- (delta vs. mês anterior + sparkline). O adapter `painel-repository.pg`
-- computa, em `serieTendencias()`, contagens cumulativas por marco de fim de
-- mês com filtros do tipo `created_at < :fim` e `indexado_em < :fim`.
--
-- Sem índice nessas colunas de data, cada marco força um Seq Scan. São
-- MESES_SERIE (6) marcos x 3 métricas, então o ganho com índice é direto.
--
-- `postos.created_at` ainda não tinha índice (a migration 0002 cria a tabela
-- sem índice de data). `arquivos_indexados` e `arquivos_orfaos` já têm índice
-- em `data_modificacao` / `indexado_em` (0003/0004), mas reforçamos abaixo de
-- forma idempotente para garantir a coluna exata usada nas séries.
--
-- Idempotente: IF NOT EXISTS. Reversível: DROP INDEX IF EXISTS.
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_postos_created_at
  ON postos (created_at);

CREATE INDEX IF NOT EXISTS idx_arquivos_indexados_indexado_em
  ON arquivos_indexados (indexado_em);

CREATE INDEX IF NOT EXISTS idx_arquivos_orfaos_indexado_em
  ON arquivos_orfaos (indexado_em);
