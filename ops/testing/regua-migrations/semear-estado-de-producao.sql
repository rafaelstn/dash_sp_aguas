-- =============================================================================
-- Semeia o ESTADO REAL DE PRODUCAO que faz uma migration nao idempotente abortar.
-- =============================================================================
-- Por que existe: o `db/migrate.sh` reaplica TODOS os arquivos a cada subida,
-- porque nao ha tabela de controle. O CI ja reaplicava tudo e ficava verde, mas
-- reaplicava sobre banco VAZIO, e banco vazio faz a migration certa e a errada
-- passarem igual. Custou o servico no ar DUAS vezes:
--
--   10/09/2026  0045, uq_estacoes_pluviometricas_prefixo, "Key (prefixo)=(532)
--               is duplicated". Corrigido no commit 5ff93c7.
--   22/09/2026  0057, uq_estoque_unidades_codigo_spaguas, "Key
--               (codigo_spaguas)=(SPA26) is duplicated". Mesma classe, porque a
--               guarda so protegia o caminho onde foi posta.
--
-- Nos dois casos o indice e TRANSITORIO: um arquivo posterior o derruba porque
-- o invariante estava errado, e o dado duplicado e LEGITIMO. Reaplicar encontra
-- o indice ausente, passa do `IF NOT EXISTS` e morre na duplicata.
--
-- Este arquivo roda ENTRE a aplicacao do zero e a reaplicacao, no CI e na
-- bancada. Mora em ops/testing/ de proposito: o Dockerfile.migrate faz
-- `COPY db/ /db/`, entao um arquivo que INSERE dado de teste viajaria dentro da
-- imagem de producao se ficasse em db/. Nunca toca banco de producao.
--
-- Anti vacuidade: a primeira tentativa de prova do 5ff93c7 passou SEM duplicata
-- nenhuma, porque a semeadura falhou calada em coluna NOT NULL e em CHECK, e a
-- reaplicacao ficou verde medindo o vazio. Por isso cada bloco CONFERE o que
-- semeou e levanta excecao se a duplicata nao existir de fato.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Estacoes pluviometricas: prefixo repetido entre tipos hidrologicos.
--    Legitimo desde a 0052, que trocou a chave natural para sibh_id.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  grupos int;
BEGIN
  INSERT INTO estacoes_pluviometricas (prefixo, nome, lat, lng, tipo, sibh_id)
  VALUES
    ('532', 'REGUA DE PROVA A (regua do CI)', -23.5, -46.6, 'manual',     'regua-ci-estacao-1'),
    ('532', 'REGUA DE PROVA B (regua do CI)', -23.6, -46.7, 'automatico', 'regua-ci-estacao-2')
  ON CONFLICT DO NOTHING;

  SELECT COUNT(*)::int INTO grupos
    FROM (
      SELECT prefixo FROM estacoes_pluviometricas
       WHERE prefixo IS NOT NULL
       GROUP BY prefixo HAVING COUNT(*) > 1
    ) d;

  IF grupos = 0 THEN
    RAISE EXCEPTION
      'regua vazia: nenhum prefixo duplicado em estacoes_pluviometricas apos semear. A reaplicacao nao mediria nada.';
  END IF;
  RAISE NOTICE 'semeado: % grupo(s) de prefixo duplicado em estacoes_pluviometricas.', grupos;
END
$$;

-- -----------------------------------------------------------------------------
-- 2. Estoque: codigo_spaguas repetido (e codigo de LOTE, nao patrimonio).
--    Em producao sao 521 linhas com 'SPA26', legitimas desde a 0060.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  grupos int;
BEGIN
  INSERT INTO estoque_unidades (codigo, codigo_spaguas, descricao)
  VALUES
    ('regua-ci-unidade-1', 'SPA26', 'Unidade de prova A (regua do CI)'),
    ('regua-ci-unidade-2', 'SPA26', 'Unidade de prova B (regua do CI)')
  ON CONFLICT DO NOTHING;

  SELECT COUNT(*)::int INTO grupos
    FROM (
      SELECT codigo_spaguas FROM estoque_unidades
       WHERE codigo_spaguas IS NOT NULL
       GROUP BY codigo_spaguas HAVING COUNT(*) > 1
    ) d;

  IF grupos = 0 THEN
    RAISE EXCEPTION
      'regua vazia: nenhum codigo_spaguas duplicado em estoque_unidades apos semear. A reaplicacao nao mediria nada.';
  END IF;
  RAISE NOTICE 'semeado: % grupo(s) de codigo_spaguas duplicado em estoque_unidades.', grupos;
END
$$;
