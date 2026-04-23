-- =============================================================================
-- Migration 0018 — Valor 'REPOSITORIO' em `arquivos_indexados.formato_nome`
-- =============================================================================
-- Contexto: a migration 0015 criou o CHECK com {COMPLETO, PARCIAL, LEGADO}
-- — todos reflexos do *nome* do arquivo. Arquivos do Modelo B (CTHDOC) são
-- nomeados apenas por número sequencial e o vínculo com o posto vem da
-- planilha XLSX (ver migration 0016 + docs/repositorio-cliente.md §3).
--
-- Forçar 'LEGADO' seria mentira semântica (LEGADO = prefixo + data no nome).
-- Adiciono 'REPOSITORIO' ao CHECK para distinguir a origem do arquivo. A
-- coluna complementar `origem_mapeamento` (0016) continua indicando *como* o
-- vínculo foi estabelecido ('NOME' vs 'PLANILHA_XLSX').
--
-- Idempotente: só recria o CHECK se o atual não contempla 'REPOSITORIO'.
-- =============================================================================

DO $$
DECLARE
  definicao_atual TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO definicao_atual
    FROM pg_constraint
   WHERE conname = 'arquivos_indexados_formato_nome_check';

  -- Nome do CHECK gerado automaticamente pelo Postgres quando declarado
  -- inline na coluna (migration 0015: `CHECK (formato_nome IN (...))`).
  IF definicao_atual IS NULL OR definicao_atual NOT LIKE '%REPOSITORIO%' THEN
    IF definicao_atual IS NOT NULL THEN
      ALTER TABLE arquivos_indexados DROP CONSTRAINT arquivos_indexados_formato_nome_check;
    END IF;

    ALTER TABLE arquivos_indexados
      ADD CONSTRAINT arquivos_indexados_formato_nome_check
        CHECK (formato_nome IN ('COMPLETO', 'PARCIAL', 'LEGADO', 'REPOSITORIO'));
  END IF;
END$$;

COMMENT ON COLUMN arquivos_indexados.formato_nome IS
  'Formato detectado pelo indexer. COMPLETO/PARCIAL/LEGADO descrevem a aderência do nome ao padrão do Modelo A. REPOSITORIO identifica arquivos do Modelo B (CTHDOC), cujo nome é um número e o vínculo vem da planilha (ver origem_mapeamento).';
