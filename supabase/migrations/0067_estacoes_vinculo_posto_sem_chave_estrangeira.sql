-- =============================================================================
-- Migration 0067, Monitor: o vinculo ao catalogo de postos deixa de ser chave
-- estrangeira e passa a ser um fato booleano.
-- =============================================================================
-- INCIDENTE QUE ORIGINA ESTA MIGRATION (medido em producao, 04/09/2026)
--
-- A sincronizacao horaria do Monitor respondia HTTP 200 com metade das estacoes
-- no campo `erros` do corpo:
--
--   insert or update on table "estacoes_pluviometricas" violates foreign key
--   constraint "estacoes_pluviometricas_posto_id_fkey"
--
-- 2.714 das 5.415 estacoes do SIBH nao entravam no banco, e a conta fecha por
-- tipo hidrologico (1.833 pluviometricas + 782 fluviometricas + 99
-- piezometricas). Nao era falha intermitente: era TODA estacao cujo prefixo
-- casava com um posto do orgao.
--
-- CAUSA
--
-- Depois do ADR-0023, `postosRepository` e o adaptador SQL Server, e
-- `mapaIdsPorPrefixo()` devolve o `Postos.Id` (uniqueidentifier) do banco do
-- ORGAO. Esse identificador era gravado em `estacoes_pluviometricas.posto_id`,
-- que a migration 0045 declarou como
--
--   posto_id UUID NULL REFERENCES postos (id) ON DELETE SET NULL
--
-- ou seja, chave estrangeira para a tabela `postos` do NOSSO PostgreSQL, que
-- passou a ficar vazia por desenho (o cadastro agora vem do orgao ao vivo).
-- Identificador de um armazenamento gravado como chave estrangeira do outro:
-- casar com um posto era exatamente a condicao para a linha ser recusada.
--
-- Isto e a regra inegociavel do ADR-0023 (secao 2.3, "nenhum adaptador executa
-- juncao entre os dois armazenamentos") sendo violada por um caminho que aquele
-- documento nao listou. O ADR mapeou oito pontos de juncao cruzada, todos em
-- `JOIN` de SQL, em `ana-revisao-repository.pg.ts` e
-- `inventario-ana-export-repository.pg.ts`. Este e o NONO, e e o unico que nao
-- aparece como `JOIN`: e uma restricao de integridade persistida. O efeito e o
-- mesmo acoplamento, com o agravante de o banco recusar a escrita.
--
-- DECISAO
--
-- O identificador do outro armazenamento sai do nosso schema. Nao ha campo que
-- o substitua, porque nada nunca precisou dele: medido no codigo, os tres unicos
-- consumidores de `posto_id` (a forma do ponto no mapa, o link da lista e o link
-- do painel de detalhe) so perguntam se EXISTE vinculo, e a navegacao ja e por
-- `prefixo` (`/postos/{prefixo}`), que e a chave natural que os dois lados
-- compartilham. O valor do id nunca foi lido.
--
-- Entra `vinculado_a_posto BOOLEAN NOT NULL DEFAULT FALSE`, gravado pela
-- sincronizacao, que ja carrega o mapa de prefixos do orgao numa consulta por
-- lote (o que o ADR-0023 prescreve para composicao entre os dois
-- armazenamentos). Um booleano nao pode ser alvo de juncao nem ser resolvido
-- contra o outro banco: e um fato, nao uma identidade, e por isso nao reabre o
-- acoplamento que esta migration fecha.
--
-- ALTERNATIVA DESCARTADA: resolver o vinculo em tempo de LEITURA, chamando
-- `mapaIdsPorPrefixo()` a cada carga do mapa. E a leitura mais pura do ADR e
-- daria frescor absoluto, mas poe o SQL Server do orgao no caminho critico de
-- uma tela que hoje e 100% PostgreSQL, em troca de no maximo uma hora de
-- defasagem no TAMANHO DE UM PONTO no mapa. Trocar disponibilidade por
-- cosmetica e mau negocio. Se o frescor passar a importar, o ponto de troca e
-- uma linha em `src/app/api/monitor/estacoes/route.ts`.
--
-- SEM INDICE NOVO: nenhuma consulta filtra ou ordena por este campo (medido).
-- Indice que ninguem usa e custo de escrita sem contrapartida.
--
-- ORDEM DE APLICACAO EM PRODUCAO
--
-- Esta migration foi separada da 0068 (que remove a coluna) de proposito, para
-- que ela possa ser aplicada ANTES do deploy da imagem nova. Ela sozinha ja
-- corrige o incidente: sem a chave estrangeira, o codigo que esta rodando hoje
-- volta a gravar as 5.415 estacoes na proxima execucao horaria, escrevendo em
-- `posto_id` um uuid que ninguem mais le. A 0068 roda depois do deploy.
--
--   1. aplicar 0067  -> sincronizacao volta a gravar tudo (correcao imediata)
--   2. subir a imagem nova -> passa a gravar `vinculado_a_posto`
--   3. aplicar 0068  -> remove `posto_id`
--
-- Aplicar as duas de uma vez tambem e correto, desde que seja DEPOIS do deploy.
--
-- IDEMPOTENTE, e isso e requisito e nao cortesia: `db/migrate.sh` reaplica
-- TODOS os arquivos deste diretorio a cada subida, sem tabela de controle. Por
-- isso o passo que le `posto_id` roda dentro de um bloco guardado pelo catalogo
-- e por EXECUTE dinamico: depois que a 0068 remover a coluna, uma referencia
-- literal a ela abortaria o `psql -v ON_ERROR_STOP=1` e o app nao subiria.
-- =============================================================================

-- 1) A chave estrangeira sai. E ela, e so ela, que recusa a escrita hoje.
ALTER TABLE estacoes_pluviometricas
  DROP CONSTRAINT IF EXISTS estacoes_pluviometricas_posto_id_fkey;

-- 2) O fato booleano entra. DEFAULT FALSE nao reescreve a tabela (PG 11+):
--    linha existente que ninguem sincronizou ainda aparece como sem vinculo,
--    que e a renderizacao degradada segura (ponto padrao, sem link).
ALTER TABLE estacoes_pluviometricas
  ADD COLUMN IF NOT EXISTS vinculado_a_posto BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN estacoes_pluviometricas.vinculado_a_posto IS
  'Havia posto com o mesmo prefixo no catalogo do orgao na ultima sincronizacao. Fato derivado, nao identidade: NAO existe chave estrangeira entre este banco e o do orgao (ADR-0023). A navegacao para o posto e por prefixo.';

-- 3) Backfill a partir do estado antigo, enquanto a coluna antiga existir.
--    Guardado pelo catalogo E por EXECUTE: quando a 0068 ja tiver rodado, este
--    bloco vira no-op em vez de erro de parse.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'estacoes_pluviometricas'
       AND column_name  = 'posto_id'
  ) THEN
    EXECUTE 'UPDATE estacoes_pluviometricas
                SET vinculado_a_posto = TRUE
              WHERE posto_id IS NOT NULL
                AND vinculado_a_posto = FALSE';
  END IF;
END
$$;
