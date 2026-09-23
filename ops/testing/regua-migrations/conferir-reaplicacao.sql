-- =============================================================================
-- Confere o que a reaplicacao tinha que preservar, e limpa a semeadura.
-- =============================================================================
-- Roda DEPOIS de `semear-estado-de-producao.sql` e da segunda passada das
-- migrations. A reaplicacao ter saido 0 ja e a prova principal; aqui ficam as
-- tres perguntas que o exit 0 sozinho nao responde:
--
--   1. o dado duplicado sobreviveu (nenhuma migration o apagou para satisfazer
--      um indice que a migration seguinte remove);
--   2. o indice TRANSITORIO continua ausente no estado final;
--   3. o indice que o SUBSTITUIU existe. Sem esta terceira, a assercao de
--      ausencia passaria tambem com a tabela inteira faltando.
--
-- No fim, remove so as linhas que a regua criou (prefixo 'regua-ci-'), para nao
-- contaminar os testes de integracao que rodam em seguida.
-- =============================================================================

DO $$
DECLARE
  faltando text := '';
  n int;
BEGIN
  -- 1. o dado duplicado sobreviveu
  SELECT COUNT(*)::int INTO n FROM estacoes_pluviometricas WHERE sibh_id LIKE 'regua-ci-%';
  IF n <> 2 THEN
    faltando := faltando || format('estacoes semeadas sobreviventes=%s (esperado 2); ', n);
  END IF;

  SELECT COUNT(*)::int INTO n FROM estoque_unidades WHERE codigo LIKE 'regua-ci-%';
  IF n <> 2 THEN
    faltando := faltando || format('unidades semeadas sobreviventes=%s (esperado 2); ', n);
  END IF;

  -- 2. indices transitorios ausentes no estado final
  IF to_regclass('public.uq_estacoes_pluviometricas_prefixo') IS NOT NULL THEN
    faltando := faltando || 'uq_estacoes_pluviometricas_prefixo voltou (a 0052 o derruba); ';
  END IF;
  IF to_regclass('public.uq_estoque_unidades_codigo_spaguas') IS NOT NULL THEN
    faltando := faltando || 'uq_estoque_unidades_codigo_spaguas voltou (a 0060 o derruba); ';
  END IF;

  -- 3. ancora de presenca: quem substituiu cada um existe
  IF to_regclass('public.uq_estacoes_pluviometricas_sibh_id') IS NULL THEN
    faltando := faltando || 'uq_estacoes_pluviometricas_sibh_id ausente (a 0052 o cria); ';
  END IF;
  IF to_regclass('public.uq_estoque_unidades_codigo') IS NULL THEN
    faltando := faltando || 'uq_estoque_unidades_codigo ausente (a 0060 o cria); ';
  END IF;
  IF to_regclass('public.idx_estoque_unidades_codigo_spaguas') IS NULL THEN
    faltando := faltando || 'idx_estoque_unidades_codigo_spaguas ausente (a 0060 o cria, e e a marca que guarda a 0057); ';
  END IF;

  IF faltando <> '' THEN
    RAISE EXCEPTION 'reaplicacao com dado presente reprovou: %', faltando;
  END IF;
  RAISE NOTICE 'reaplicacao conferida: dado preservado, indices transitorios ausentes, substitutos presentes.';
END
$$;

DELETE FROM estacoes_pluviometricas WHERE sibh_id LIKE 'regua-ci-%';
DELETE FROM estoque_unidades WHERE codigo LIKE 'regua-ci-%';
