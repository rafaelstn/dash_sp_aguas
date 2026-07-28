-- =============================================================================
-- Migration 0065, modulo Estoque: autoria da CONTAGEM no item de conferencia.
-- =============================================================================
-- Contexto: a auditoria de 27/07/2026 achou um buraco na trilha. A sessao guarda
-- quem abriu (`criada_por`) e quem concluiu (`concluida_por`), e o item guarda
-- quem reconciliou (`reconciliado_por`), mas NAO havia onde gravar quem declarou
-- a contagem fisica, que e justamente o numero de onde o ajuste patrimonial
-- deriva. O port ja recebia `usuarioId` nas duas operacoes de escrita e os dois
-- adapters descartavam o argumento; a autoria so existia no log da aplicacao,
-- que e volatil e nao e trilha oficial.
--
-- Numa auditoria do orgao sobre divergencia de patrimonio, a pergunta "quem
-- contou 3 onde o sistema dizia 8" precisa ser respondida pelo DADO. Rule de
-- governo: audit trail de alteracao com quem, quando e o que.
--
-- Colunas NULLABLE de proposito: linhas de snapshot nascem sem contagem, e as
-- que ja existirem (nenhuma em producao em 27/07/2026, conferido: zero sessoes)
-- ficam com autoria desconhecida em vez de autoria falsa.
--
-- Idempotente / reversivel.
-- Reversao:
--   ALTER TABLE estoque_conferencia_itens
--     DROP COLUMN IF EXISTS contado_por, DROP COLUMN IF EXISTS contado_em;
-- Depende de: 0063 (estoque_conferencia_itens).
-- =============================================================================

ALTER TABLE estoque_conferencia_itens
  ADD COLUMN IF NOT EXISTS contado_por UUID        NULL,
  ADD COLUMN IF NOT EXISTS contado_em  TIMESTAMPTZ NULL;

COMMENT ON COLUMN estoque_conferencia_itens.contado_por IS
  'Quem declarou a contagem fisica deste item (auth do backend, nunca do corpo da requisicao). NULL enquanto o item nao foi contado. Trilha exigida para orgao publico: o ajuste patrimonial deriva deste numero.';
COMMENT ON COLUMN estoque_conferencia_itens.contado_em IS
  'Quando a contagem foi declarada. Atualizado a cada recontagem (a versao anterior fica no historico da movimentacao, se houver).';

-- Coerencia: contagem declarada exige autor, no mesmo espirito do
-- ck_estoque_conf_item_recon. Nao vale para linha nunca contada.
DO $migration_0065$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_estoque_conf_item_contagem_autor'
  ) THEN
    ALTER TABLE estoque_conferencia_itens
      ADD CONSTRAINT ck_estoque_conf_item_contagem_autor
      CHECK (contado_em IS NULL OR contado_por IS NOT NULL);
  END IF;
END
$migration_0065$;
