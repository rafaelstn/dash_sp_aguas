-- =============================================================================
-- Migration 0072, correcao de dado: jsonb gravado como STRING em vez de valor.
-- =============================================================================
-- Contexto: os repositorios gravavam `${JSON.stringify(x)}::jsonb` com o driver
-- postgres-js. O driver manda o texto como parametro de tipo json, e o cast
-- produz um jsonb do tipo 'string' contendo o JSON (medido: jsonb_typeof =
-- 'string'). O produto le isso de volta como string JS: diagrama reabre vazio,
-- ficha de visita chega como texto, payload de evento nao tem chave. Na
-- aprovacao da triagem a copia para fichas_visita saia codificada DUAS vezes.
-- Os repositorios passaram a gravar com sql.json(...) (mesmo padrao do
-- importador de desconformidades). Esta migration corrige o que ja foi gravado.
--
-- O que faz: para cada coluna afetada, pega so as linhas com
-- jsonb_typeof = 'string', desembrulha enquanto o valor for string que parseia
-- como JSON (ate 10 niveis, cobre a dupla codificacao) e grava SOMENTE se o
-- resultado final for do tipo esperado da coluna (array em
-- diagramas.elementos, objeto nas demais). String que nao e JSON valido, ou
-- que desembrulha para escalar, fica INTOCADA e entra na contagem de mantidas:
-- nunca quebra a migration e nunca vira lixo.
--
-- Tabelas de trilha (triagem_eventos, postos_evento, ana_revisao_evento,
-- cron_heartbeats): CONVERTIDAS, por decisao registrada. A correcao muda a
-- CODIFICACAO, nao o conteudo do evento: o valor desembrulhado e exatamente o
-- que a aplicacao pretendia gravar. Medido no catalogo em 16/09/2026: nao ha
-- gatilho de imutabilidade, regra, view nem funcao que dependa dessas colunas,
-- nem cadeia de hash sobre a trilha; o REVOKE UPDATE FROM PUBLIC (0033 e
-- seguintes) nao alcanca o dono que roda as migrations. Precedente de excecao
-- controlada sobre trilha: 0048 (anonimizar_trilha_auditoria). O UPDATE e
-- restrito por construcao a linha string que desembrulha para objeto.
--
-- Carimbos: diagramas, fichas_visita e fichas_triagem tem gatilho BEFORE UPDATE
-- que sobrescreve atualizado_em/atualizada_em. Corrigir codificacao nao e
-- edicao do usuario, entao o gatilho nominal e desligado so durante o UPDATE e
-- so quando ha linha a converter (sem linha, nenhum ALTER TABLE e nenhuma
-- trava). Tudo roda dentro do DO, numa transacao: erro desfaz inclusive o
-- ALTER TABLE.
--
-- Log: RAISE NOTICE com CONTAGEM por coluna, nunca conteudo (fichas podem ter
-- dado pessoal).
--
-- Idempotente: na segunda execucao nao ha linha 'string' convertivel; o custo
-- e uma varredura por coluna (tabelas pequenas) e as mantidas voltam a ser
-- contadas, sem escrita.
-- Reversao semantica (nao recomendada): SET col = to_jsonb(col::text) nas
-- linhas convertidas; nao ha como distinguir quais foram sem snapshot.
-- Fora de escopo: estoque_desconformidades.dados (CHECK exige objeto, sempre
-- gravado com sql.json); import_log/indexacao_log.erros_amostra (gravados por
-- psycopg3, medido como objeto).
-- =============================================================================

CREATE OR REPLACE FUNCTION pg_temp.jsonb_desembrulhar_0072(v jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  atual  jsonb := v;
  nivel  int   := 0;
BEGIN
  WHILE atual IS NOT NULL AND jsonb_typeof(atual) = 'string' AND nivel < 10 LOOP
    BEGIN
      atual := (atual #>> '{}')::jsonb;
    EXCEPTION WHEN invalid_text_representation THEN
      RETURN NULL;
    END;
    nivel := nivel + 1;
  END LOOP;
  RETURN atual;
END;
$$;

DO $$
DECLARE
  alvo        record;
  a_converter bigint;
  mantidas    bigint;
  convertidas bigint;
BEGIN
  FOR alvo IN
    SELECT * FROM (VALUES
      ('diagramas',          'elementos',      'array',  'diagramas_atualizado_em'),
      ('fichas_visita',      'dados',          'object', 'fichas_visita_atualizada_em'),
      ('fichas_triagem',     'dados',          'object', 'fichas_triagem_atualizada_em'),
      ('triagem_eventos',    'payload',        'object', NULL),
      ('postos_evento',      'valores_antes',  'object', NULL),
      ('postos_evento',      'valores_depois', 'object', NULL),
      ('ana_revisao_evento', 'valores_antes',  'object', NULL),
      ('ana_revisao_evento', 'valores_depois', 'object', NULL),
      ('cron_heartbeats',    'payload',        'object', NULL)
    ) AS t(tabela, coluna, tipo, gatilho)
  LOOP
    IF to_regclass('public.' || alvo.tabela) IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = alvo.tabela
            AND column_name = alvo.coluna
            AND data_type = 'jsonb')
    THEN
      RAISE NOTICE '[0072] %.% ausente, ignorada', alvo.tabela, alvo.coluna;
      CONTINUE;
    END IF;

    EXECUTE format(
      'SELECT count(*) FILTER (WHERE jsonb_typeof(pg_temp.jsonb_desembrulhar_0072(%1$I)) = %2$L),
              count(*) FILTER (WHERE jsonb_typeof(pg_temp.jsonb_desembrulhar_0072(%1$I)) IS DISTINCT FROM %2$L)
         FROM public.%3$I
        WHERE jsonb_typeof(%1$I) = ''string''',
      alvo.coluna, alvo.tipo, alvo.tabela)
    INTO a_converter, mantidas;

    convertidas := 0;
    IF a_converter > 0 THEN
      IF alvo.gatilho IS NOT NULL AND EXISTS (
           SELECT 1 FROM pg_trigger
            WHERE tgrelid = ('public.' || alvo.tabela)::regclass
              AND tgname = alvo.gatilho
              AND NOT tgisinternal)
      THEN
        EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER %I', alvo.tabela, alvo.gatilho);
      END IF;

      EXECUTE format(
        'UPDATE public.%3$I
            SET %1$I = pg_temp.jsonb_desembrulhar_0072(%1$I)
          WHERE jsonb_typeof(%1$I) = ''string''
            AND jsonb_typeof(pg_temp.jsonb_desembrulhar_0072(%1$I)) = %2$L',
        alvo.coluna, alvo.tipo, alvo.tabela);
      GET DIAGNOSTICS convertidas = ROW_COUNT;

      IF alvo.gatilho IS NOT NULL AND EXISTS (
           SELECT 1 FROM pg_trigger
            WHERE tgrelid = ('public.' || alvo.tabela)::regclass
              AND tgname = alvo.gatilho
              AND NOT tgisinternal)
      THEN
        EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER %I', alvo.tabela, alvo.gatilho);
      END IF;
    END IF;

    RAISE NOTICE '[0072] %.%: convertidas=%, mantidas_como_string=%',
      alvo.tabela, alvo.coluna, convertidas, mantidas;
  END LOOP;
END;
$$;

DROP FUNCTION IF EXISTS pg_temp.jsonb_desembrulhar_0072(jsonb);
