-- =============================================================================
-- Migration 0034, adiciona coluna `orgao` em ana_revisao_lote.
-- =============================================================================
-- Decisao Rafael 2026-05-14: o sistema deve aceitar varias auditorias
-- ciclicamente (ANA, CETESB, IGAM, etc) sem criar tela nova pra cada.
-- O modelo de "lote" ja eh generico (1 planilha = 1 lote). Faltava
-- apenas identificar o orgao auditor.
--
-- A tabela continua se chamando ana_revisao_lote/estacao por hora
-- (rename de tabela é caro e nao desbloqueia ninguem). Da pra renomear
-- numa migration futura.
-- =============================================================================

ALTER TABLE ana_revisao_lote
  ADD COLUMN IF NOT EXISTS orgao TEXT NOT NULL DEFAULT 'ANA';

COMMENT ON COLUMN ana_revisao_lote.orgao IS
  'Orgao auditor: ANA, CETESB, IGAM, etc. Permite varias auditorias coexistirem sem mudar UI.';

CREATE INDEX IF NOT EXISTS idx_ana_revisao_lote_orgao
  ON ana_revisao_lote (orgao);
