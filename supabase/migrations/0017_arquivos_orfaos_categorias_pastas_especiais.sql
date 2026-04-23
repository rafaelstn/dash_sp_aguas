-- =============================================================================
-- Migration 0017 — Amplia CHECK de `arquivos_orfaos.categoria`
-- =============================================================================
-- Contexto: o cliente já organiza no HD, fora do fluxo normal, dois conjuntos
-- de arquivos que precisam virar categorias próprias de órfão (ver
-- docs/repositorio-cliente.md §4):
--
--   - `0 DUVIDAS` / `0 duvidas`              -> categoria PENDENCIA_CLIENTE
--   - `0 FICHAS DESCRITIVAS ...`             -> categoria FICHA_GERAL
--
-- Postgres não permite ALTER CHECK in-place: precisa DROP + ADD. O bloco DO $$
-- abaixo só recria o CHECK se a definição atual ainda não contém os novos
-- valores — tornando a migration idempotente em reexecuções.
-- =============================================================================

DO $$
DECLARE
  definicao_atual TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO definicao_atual
    FROM pg_constraint
   WHERE conname = 'chk_orfao_categoria';

  IF definicao_atual IS NULL
     OR definicao_atual NOT LIKE '%PENDENCIA_CLIENTE%'
     OR definicao_atual NOT LIKE '%FICHA_GERAL%' THEN

    IF definicao_atual IS NOT NULL THEN
      ALTER TABLE arquivos_orfaos DROP CONSTRAINT chk_orfao_categoria;
    END IF;

    ALTER TABLE arquivos_orfaos
      ADD CONSTRAINT chk_orfao_categoria
        CHECK (categoria IN (
          'PREFIXO_DESCONHECIDO',
          'NOME_FORA_DO_PADRAO',
          'EXTENSAO_NAO_PDF',
          'PENDENCIA_CLIENTE',
          'FICHA_GERAL'
        ));
  END IF;
END$$;
