-- =============================================================================
-- Migration 0015 — Coluna `formato_nome` em `arquivos_indexados`
-- =============================================================================
-- Registra qual dos 3 formatos de nome de arquivo cada registro seguiu, após
-- descoberta (22/04/2026) de que apenas 7,88% dos arquivos do HD do cliente
-- aderem ao formato oficial COMPLETO. Os demais seguem PARCIAL (sem
-- cod_encarregado; caso dominante em documentos históricos) ou LEGADO
-- (apenas prefixo e data). PARCIAL e LEGADO são CONFORMES — não são
-- tratados como desconformidades.
-- =============================================================================

ALTER TABLE arquivos_indexados
  ADD COLUMN formato_nome VARCHAR(16) NOT NULL DEFAULT 'COMPLETO'
    CHECK (formato_nome IN ('COMPLETO', 'PARCIAL', 'LEGADO'));

COMMENT ON COLUMN arquivos_indexados.formato_nome IS
  'Formato do nome de arquivo detectado pelo indexer. Apenas 7,88% dos arquivos seguem o formato oficial COMPLETO. PARCIAL = sem CodEnc. LEGADO = apenas prefixo e data (documentos históricos).';
