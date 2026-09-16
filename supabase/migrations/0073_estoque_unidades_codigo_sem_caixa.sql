-- =============================================================================
-- Migration 0073, modulo Estoque: unicidade do codigo da unidade SEM caixa.
-- =============================================================================
-- Contexto (reprovacao do QA na subida): a 0060 criou
-- `uq_estoque_unidades_codigo` ON (codigo), que diferencia caixa. Todo o resto
-- do produto compara SEM caixa: a busca (ILIKE), o filtro ?codigo= e o leitor
-- da conferencia (lower(u.codigo) = lower($1)). Resultado medido: PATCH de uma
-- unidade para "001spa26arara" com "001SPA26Arara" ja gravado dava 200, e o
-- leitor da conferencia passava a achar DUAS unidades para a mesma etiqueta.
--
-- Correcao: o mesmo indice, com o mesmo NOME, passa a ser sobre lower(codigo).
--   * O nome se mantem de proposito. O migrate roda TODOS os arquivos a cada
--     subida; a 0060 continua com CREATE UNIQUE INDEX IF NOT EXISTS
--     uq_estoque_unidades_codigo e, como o nome ja existe, nao recria o indice
--     antigo. Com nome novo, a 0060 recriaria o indice por caixa a cada subida.
--     O adapter pg traduz o 23505 por esse nome (CodigoUnidadeDuplicado).
--   * O codigo gravado NAO e normalizado nem alterado: a etiqueta impressa usa
--     a caixa original. So a regra de unicidade muda.
--
-- Protecao: antes de trocar o indice, procura codigo repetido por lower(codigo).
-- Havendo, a migration FALHA (ON_ERROR_STOP derruba a subida) listando ate 10
-- grupos. Codigo de etiqueta nao e dado pessoal. A tabela fica travada contra
-- escrita (SHARE ROW EXCLUSIVE) entre a verificacao e a criacao, para nenhuma
-- gravacao concorrente abrir duplicata no meio.
--
-- Idempotente: se o indice ja existe sobre lower(codigo), nada e feito (sem
-- trava, sem varredura). Tudo roda dentro do DO, numa transacao: erro desfaz
-- inclusive o DROP INDEX.
-- Reversao: DROP INDEX uq_estoque_unidades_codigo; e recriar ON (codigo)
-- WHERE codigo IS NOT NULL (volta a aceitar duplicata por caixa).
-- =============================================================================

DO $$
DECLARE
  definicao   text;
  grupos      int;
  exemplos    text;
BEGIN
  SELECT pg_get_indexdef(c.oid)
    INTO definicao
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relname = 'uq_estoque_unidades_codigo'
     AND c.relkind = 'i'
     AND n.nspname = 'public';

  IF definicao IS NOT NULL
     AND definicao = 'CREATE UNIQUE INDEX uq_estoque_unidades_codigo ON public.estoque_unidades USING btree (lower(codigo)) WHERE (codigo IS NOT NULL)' THEN
    RAISE NOTICE '0073: uq_estoque_unidades_codigo ja e sobre lower(codigo), nada a fazer.';
    RETURN;
  END IF;

  LOCK TABLE public.estoque_unidades IN SHARE ROW EXCLUSIVE MODE;

  SELECT COUNT(*)::int,
         string_agg(variantes, '; ' ORDER BY chave) FILTER (WHERE ordem <= 10)
    INTO grupos, exemplos
    FROM (
      SELECT lower(codigo) AS chave,
             string_agg(codigo, ' | ' ORDER BY codigo) AS variantes,
             row_number() OVER (ORDER BY lower(codigo)) AS ordem
        FROM public.estoque_unidades
       WHERE codigo IS NOT NULL
       GROUP BY lower(codigo)
      HAVING COUNT(*) > 1
    ) repetidos;

  IF grupos > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'unique_violation',
      MESSAGE = format(
        '0073: %s codigo(s) de unidade repetido(s) sem diferenciar caixa em estoque_unidades; indice sem caixa NAO criado.',
        grupos),
      DETAIL = format('Ate 10 grupos (variantes gravadas): %s', exemplos),
      HINT = 'Corrija o codigo de uma das unidades de cada grupo (tela do estoque ou UPDATE pontual por id) e suba de novo.';
  END IF;

  DROP INDEX IF EXISTS public.uq_estoque_unidades_codigo;
  CREATE UNIQUE INDEX uq_estoque_unidades_codigo
    ON public.estoque_unidades (lower(codigo)) WHERE codigo IS NOT NULL;

  RAISE NOTICE '0073: uq_estoque_unidades_codigo recriado sobre lower(codigo).';
END
$$;

COMMENT ON COLUMN estoque_unidades.codigo IS
  'CODIGO / CODIGO MATERIAL da planilha. Identificador UNICO por unidade fisica, sem diferenciar caixa (uq_estoque_unidades_codigo sobre lower(codigo)). Gravado com a caixa original da etiqueta.';
