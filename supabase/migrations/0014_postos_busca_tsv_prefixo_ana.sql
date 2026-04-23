-- =============================================================================
-- Migration 0014 — Incluir `prefixo_ana` (paddado a 8 dígitos) no FTS de postos
-- =============================================================================
-- Motivação (22/04/2026): o importer da v1.1 não incluiu `prefixo_ana` no
-- busca_tsv. Após a descoberta de 435 postos com ANA de 7 dígitos, é desejável
-- que o técnico encontre o posto tanto pelo ANA original quanto pelo paddado.
-- A coluna é GENERATED ALWAYS STORED; precisa ser DROP/CREATE para mudar a
-- expressão. Operação atômica dentro de transação implícita.
-- =============================================================================

ALTER TABLE postos DROP COLUMN IF EXISTS busca_tsv;

ALTER TABLE postos ADD COLUMN busca_tsv TSVECTOR
  GENERATED ALWAYS AS (
    to_tsvector(
      'portuguese',
      f_unaccent(
        coalesce(prefixo,'') || ' ' ||
        coalesce(prefixo_ana,'') || ' ' ||
        coalesce(LPAD(NULLIF(prefixo_ana,''), 8, '0'),'') || ' ' ||
        coalesce(nome_estacao,'') || ' ' ||
        coalesce(municipio,'') || ' ' ||
        coalesce(municipio_alt,'') || ' ' ||
        coalesce(bacia_hidrografica,'') || ' ' ||
        coalesce(ugrhi_nome,'') || ' ' ||
        coalesce(sub_ugrhi_nome,'') || ' ' ||
        coalesce(proprietario,'') || ' ' ||
        coalesce(mantenedor,'')
      )
    )
  ) STORED;

-- Índice GIN recriado automaticamente pela migration 0002 não é recriado;
-- como dropamos e recriamos a coluna, é necessário recriar o índice também.

DROP INDEX IF EXISTS idx_postos_busca_tsv;
CREATE INDEX idx_postos_busca_tsv
  ON postos USING gin (busca_tsv);
