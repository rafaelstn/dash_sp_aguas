-- =============================================================================
-- Migration 0052, modulo Monitor: chave natural das estacoes passa de
-- `prefixo` para `sibh_id`.
-- =============================================================================
-- Contexto: ate a migration 0045 a tabela `estacoes_pluviometricas` so guardava
-- estacoes pluviometricas, e ali o `prefixo` era unico (indice parcial unico
-- `uq_estacoes_pluviometricas_prefixo`). Com a 0051 a tabela passou a guardar os
-- tres tipos hidrologicos (pluvio/fluvio/piezo), e o pressuposto de unicidade do
-- prefixo QUEBROU:
--
--   - 364 prefixos de estacao fluviometrica colidem com prefixos de
--     pluviometrica ja persistida (mesmo prefixo, tipos diferentes). Com o
--     upsert conflitando em `prefixo`, esses casos SOBRESCREVERIAM a linha
--     pluviometrica existente (viraria tipo_estacao='fluviometrico') =
--     corrupcao de dado.
--   - Ha ainda prefixo repetido DENTRO do mesmo tipo (ex.: prefixo '1001855' em
--     duas estacoes fluviometricas com sibh_id 933 e 35331), o que faz um unico
--     INSERT ... ON CONFLICT falhar com "cannot affect row a second time".
--
-- Fato verificado no banco de producao: `sibh_id` e a chave estavel e unica.
-- Sobre as 3690 estacoes persistidas: 3690 sibh_id distintos, zero nulos. O
-- proprio port sibh-gateway ja documentava: "o mesmo prefixo pode aparecer em
-- tipos diferentes; o id resolve a ambiguidade."
--
-- Mudanca de chave natural:
--   - `sibh_id` passa a ser a chave de conflito do upsert (unico quando NOT NULL).
--   - `prefixo` deixa de ser unico: continua atributo consultavel (o vinculo ao
--     catalogo `postos` ainda busca por prefixo), mas ganha indice NAO unico.
--
-- Portabilidade: apenas CREATE/DROP INDEX. Sem sintaxe especifica de um so banco.
--
-- Idempotente: CREATE INDEX IF NOT EXISTS / DROP INDEX IF EXISTS.
-- Reversivel: ver bloco comentado ao final (reconstroi o estado da 0045).
-- =============================================================================

-- Nova chave natural: sibh_id unico entre valores nao nulos.
CREATE UNIQUE INDEX IF NOT EXISTS uq_estacoes_pluviometricas_sibh_id
  ON estacoes_pluviometricas (sibh_id)
  WHERE sibh_id IS NOT NULL;

-- prefixo NAO e mais unico (364 colisoes flu x plu). Remove o indice unico
-- antigo antes de recriar como nao unico.
DROP INDEX IF EXISTS uq_estacoes_pluviometricas_prefixo;

-- prefixo continua consultavel (vinculo a postos busca por prefixo), agora
-- sem restricao de unicidade.
CREATE INDEX IF NOT EXISTS idx_estacoes_pluviometricas_prefixo
  ON estacoes_pluviometricas (prefixo)
  WHERE prefixo IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Reversao (rollback manual): so e seguro se a tabela nao tiver prefixos
-- duplicados no momento do rollback (ela tera, apos importar flu/piezo). Reverte
-- para o estado da 0045.
--   DROP INDEX IF EXISTS idx_estacoes_pluviometricas_prefixo;
--   DROP INDEX IF EXISTS uq_estacoes_pluviometricas_sibh_id;
--   CREATE UNIQUE INDEX IF NOT EXISTS uq_estacoes_pluviometricas_prefixo
--     ON estacoes_pluviometricas (prefixo) WHERE prefixo IS NOT NULL;
-- -----------------------------------------------------------------------------
