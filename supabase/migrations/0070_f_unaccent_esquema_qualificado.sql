-- =============================================================================
-- Migration 0070: f_unaccent com esquema qualificado
-- =============================================================================
-- Motivo: o pg_restore zera o search_path antes de recriar as tabelas. A versão
-- da 0001 chamava `unaccent('unaccent', $1)` sem esquema, e a coluna gerada de
-- `public.postos` falhava no restore com
--   function unaccent(unknown, text) does not exist
-- (medido no ensaio em 16/09/2026), o que deixava o backup sem restauração.
--
-- O esquema da extensão é lido do catálogo, e não fixado em `public`, porque no
-- Supabase a extensão pode morar em `extensions`. Não se usa `SET search_path`
-- na função: função SQL com SET não é inlined, e ela alimenta índice e coluna
-- gerada. O resultado é o mesmo para qualquer entrada, então os valores já
-- gravados continuam válidos.
--
-- Idempotente: pode ser re-executada sem erro.
-- =============================================================================

DO $migracao$
DECLARE
  esquema text;
BEGIN
  SELECT n.nspname INTO esquema
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
   WHERE e.extname = 'unaccent';

  IF esquema IS NULL THEN
    RAISE EXCEPTION 'extensão unaccent não instalada; aplique a 0001 antes';
  END IF;

  EXECUTE format(
    $f$CREATE OR REPLACE FUNCTION public.f_unaccent(text)
         RETURNS text
         LANGUAGE sql
         IMMUTABLE PARALLEL SAFE
         AS $corpo$ SELECT %1$I.unaccent(%2$L::regdictionary, $1) $corpo$$f$,
    esquema,
    format('%I.unaccent', esquema)
  );
END
$migracao$;
