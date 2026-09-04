-- =============================================================================
-- Migration 0068, Monitor: remove `estacoes_pluviometricas.posto_id`.
-- =============================================================================
-- Segunda metade da correcao iniciada na 0067 (contexto completo la). A 0067
-- tirou a chave estrangeira, que era o que recusava a escrita; esta tira a
-- coluna, que era o que carregava um identificador do banco do ORGAO dentro do
-- nosso schema.
--
-- POR QUE A COLUNA SAI, E NAO SO A RESTRICAO
--
-- Manter `posto_id` sem chave estrangeira seria guardar a identidade interna de
-- outro armazenamento numa coluna que nada le, convidando a proxima pessoa a
-- resolve-la contra `postos` e reabrir o acoplamento que o ADR-0023 proibe. O
-- que o produto usa e o booleano `vinculado_a_posto` (0067) e o `prefixo`, que
-- e a chave natural comum aos dois lados.
--
-- O DADO PERDIDO NAO TEM VALOR: os valores gravados ali eram `Postos.Id` do
-- banco do orgao, e as linhas que hoje estao em producao tem `posto_id` NULO
-- justamente porque as que casavam eram recusadas pela chave estrangeira. A
-- 0067 ja preservou a unica informacao util (havia vinculo? sim/nao) no
-- booleano, antes desta remocao.
--
-- QUANDO APLICAR: depois que a imagem nova estiver no ar. O codigo antigo cita
-- `posto_id` no INSERT e no ON CONFLICT, e sem a coluna ele falha em 100% das
-- estacoes (a 0067 sozinha ja o deixa funcionando; e por isso que ela e
-- separada).
--
-- O indice parcial `idx_estacoes_pluviometricas_posto` cai junto com a coluna;
-- o DROP INDEX explicito antes existe para o caso de uma base onde o indice
-- tenha sobrevivido a alguma correcao manual.
--
-- IDEMPOTENTE (IF EXISTS nos dois passos): `db/migrate.sh` reaplica todos os
-- arquivos a cada subida, sem tabela de controle.
-- =============================================================================

DROP INDEX IF EXISTS idx_estacoes_pluviometricas_posto;

ALTER TABLE estacoes_pluviometricas
  DROP COLUMN IF EXISTS posto_id;
