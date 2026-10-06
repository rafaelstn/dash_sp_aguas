-- =============================================================================
-- Migration 0075, modulo Estoque: quem SOLICITOU a saida, por matricula.
-- =============================================================================
-- Contexto (decidido em 06/10/2026): a saida de material precisa registrar quem
-- pediu o material, e nao so quem operou o sistema. A coluna usuario_id da 0059
-- responde "quem digitou" (vem do auth do backend, nunca do corpo) e nao
-- responde "quem levou". A versao anterior deste contrato guardava NOME em texto
-- livre e caiu na revisao: nome digitado nao identifica pessoa e vira dado
-- pessoal sem finalidade. O que entra aqui e IDENTIFICADOR: a matricula ou
-- identificacao funcional de quem solicitou.
--
-- E TEXT, e nao UUID com FK para auth.users, porque quem solicita material pode
-- nao ter conta no painel (campo, terceirizado, outra area do orgao). Espelha o
-- tratamento que a 0059 da ao usuario_id: coluna de identificador SEM chave
-- estrangeira (a 0059 e explicita nisso, e a 0069 registra a mesma decisao para
-- vinculo entre tabelas). Nulavel, porque entrada, transferencia, baixa e ajuste
-- nao tem solicitante.
--
-- A MASCARA REAL DA MATRICULA DO ORGAO NAO FOI MEDIDA. A guarda de formato aqui
-- e minima de proposito: 2 a 30 caracteres e nenhum espaco em branco. O espaco e
-- justamente o que separa matricula de nome digitado, que e o que a revisao
-- recusou. Validacao de formato so pode ENDURECER depois que o orgao responder
-- qual e o padrao (quantos digitos, se tem prefixo, se tem digito verificador).
-- Endurecer antes da resposta recusaria matricula legitima no balcao.
--
-- POR QUE `NOT VALID` NAS DUAS CONSTRAINTS (padrao novo nesta base: medido em
-- 06/10/2026, zero usos de NOT VALID em supabase/migrations/):
--   * `ADD CONSTRAINT ... CHECK (...)` normal varre a tabela INTEIRA e aborta o
--     deploy se UMA linha antiga violar. As linhas de saida gravadas antes desta
--     migration nao tem solicitante e nunca vao ter: a 0074 tornou o ledger
--     append-only no banco, com gatilho que recusa UPDATE inclusive para o dono,
--     portanto backfill e impossivel sem desligar o gatilho de proposito.
--   * `NOT VALID` aplica a regra a linha NOVA e nao olha o passado. E a unica
--     ferramenta que deixa a regra valer daqui pra frente sem mentir sobre o
--     historico e sem risco de abortar o deploy.
--   * Consequencia que fica registrada no catalogo: pg_constraint.convalidated
--     = false para as duas. Quem rodar `VALIDATE CONSTRAINT` sem antes tratar as
--     linhas antigas vai falhar, e isso esta escrito tambem no COMMENT de cada
--     constraint, que e onde quem mexer no banco vai olhar.
--
-- A ISENCAO E SEMANTICA, NAO TEMPORAL: `conferencia_id IS NOT NULL`. Saida
-- gerada por reconciliacao de conferencia (0064, resolverReconciliacao) nao tem
-- solicitante humano: ela ajusta inventario, ninguem retirou material naquele
-- momento. Sem essa isencao a reconciliacao de divergencia negativa pararia de
-- funcionar.
--
-- CONVIVENCIA COM O GATILHO DA 0074 (a pergunta que o proximo leitor vai fazer):
-- nao se tocam. O gatilho estoque_mov_append_only e BEFORE UPDATE OR DELETE e
-- nunca ve INSERT; estas duas constraints so sao avaliadas no INSERT (e no
-- UPDATE, que o gatilho recusa antes). Ordem dentro do INSERT nao importa aqui,
-- porque a unica guarda de INSERT sao as proprias constraints.
--
-- ORDEM DE DEPLOY: 1) aplicar a 0074 e conferir no catalogo, 2) aplicar esta,
-- 3) conferir no catalogo (as consultas no fim deste arquivo), 4) so entao push
-- do codigo. A ordem importa nesse sentido: o codigo novo GRAVA a coluna, entao
-- push antes de aplicar derruba toda saida com 42703 undefined_column. O inverso
-- e seguro: coluna nulavel e constraint NOT VALID nao quebram o codigo antigo,
-- que nunca envia o campo, exceto nas saidas, que passam a exigir solicitante.
-- Por isso 2 e 4 ficam no MESMO deploy, e nao em deploys separados por dias.
-- Migration commitada != migration aplicada.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS e guarda de pg_constraint por par
-- (conname, conrelid) em cada ADD CONSTRAINT.
-- Reversao:
--   ALTER TABLE estoque_movimentacoes
--     DROP CONSTRAINT IF EXISTS ck_estoque_mov_saida_solicitante,
--     DROP CONSTRAINT IF EXISTS ck_estoque_mov_matricula_formato;
--   ALTER TABLE estoque_movimentacoes DROP COLUMN IF EXISTS solicitante_matricula;
--   O DROP COLUMN apaga dado de pessoa gravado; em producao, reverter so a
--   constraint resolve quase sempre, e a coluna sai em migration propria.
-- Depende de: 0059 (estoque_movimentacoes), 0064 (conferencia_id), 0074 (nada
-- tecnico, mas a leitura desta migration depende do append-only de la).
--
-- O QUE NAO FOI MEDIDO: (1) a mascara real da matricula do orgao, como dito
-- acima; (2) nenhuma linha deste arquivo rodou contra um PostgreSQL de pe: a
-- bancada de 06/10/2026 nao tem Docker, psql, initdb nem pg_isready (decisao do
-- Rafael de 01/10/2026). Quem mede no lugar da bancada e o job `integracao` do
-- CI, por tests/integration/estoque-movimentacoes-solicitante-postgres.test.ts,
-- que afirma os DOIS lados do NOT VALID: insert novo de saida sem matricula
-- RECUSADO, e linha semeada ANTES do ADD CONSTRAINT continuando a existir
-- depois dele. O segundo caso e o que distingue NOT VALID de constraint comum.
-- O convalidated = false sai do catalogo (pg_constraint), nao deste texto.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Coluna. Forma da 0065 (ADD COLUMN IF NOT EXISTS + COMMENT ON COLUMN).
-- ADD COLUMN com default NULL nao e UPDATE, portanto nao dispara o gatilho de
-- append-only da 0074 e nao reescreve linha nenhuma.
-- -----------------------------------------------------------------------------
ALTER TABLE estoque_movimentacoes
  ADD COLUMN IF NOT EXISTS solicitante_matricula TEXT;

COMMENT ON COLUMN estoque_movimentacoes.solicitante_matricula IS
  'Matricula ou identificacao funcional de QUEM SOLICITOU a saida de material. Identificador, nunca nome: nome digitado nao identifica pessoa e vira dado pessoal sem finalidade (revisao de 06/10/2026). TEXT sem FK porque o solicitante pode nao ter conta no painel. Obrigatorio na saida pela ck_estoque_mov_saida_solicitante, exceto quando a saida vem de reconciliacao de conferencia (conferencia_id preenchido). NULL nos outros tipos. A mascara real do orgao NAO foi medida: a guarda de formato e minima (2 a 30 caracteres, sem espaco) e so pode endurecer depois da resposta do orgao.';

-- -----------------------------------------------------------------------------
-- Formato: identificador, nao frase. 2 a 30 caracteres e ZERO espaco em branco
-- ([:space:] cobre espaco, tab, nova linha, CR, FF e VT). O espaco e o que
-- separa matricula de nome digitado; sem esta guarda o campo volta a ser o nome
-- livre que a revisao recusou.
--
-- A guarda de idempotencia pergunta pelo par (conname, conrelid): conname e
-- unico por TABELA e nao por banco, entao perguntar so pelo nome faria esta
-- migration pular o ADD CONSTRAINT por causa de constraint homonima em outra
-- tabela e sair verde sem guarda nenhuma aqui. Mesmo raciocinio do par
-- (tgname, tgrelid) na 0074.
-- -----------------------------------------------------------------------------
DO $migration_0075_formato$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'ck_estoque_mov_matricula_formato'
       AND conrelid = 'public.estoque_movimentacoes'::regclass
  ) THEN
    ALTER TABLE estoque_movimentacoes
      ADD CONSTRAINT ck_estoque_mov_matricula_formato
      CHECK (
        solicitante_matricula IS NULL
        OR solicitante_matricula ~ '^[^[:space:]]{2,30}$'
      )
      NOT VALID;
  END IF;
END
$migration_0075_formato$;

COMMENT ON CONSTRAINT ck_estoque_mov_matricula_formato ON estoque_movimentacoes IS
  'NOT VALID de proposito (06/10/2026): vale para linha NOVA e nao varre o passado. Linha anterior a esta constraint pode viola-la, e rodar VALIDATE CONSTRAINT sem antes tratar as linhas antigas VAI FALHAR. Tratar linha antiga desta tabela exige desligar o gatilho estoque_mov_append_only (0074) de proposito, dentro da propria migration. Toda linha existente em 06/10/2026 tem solicitante_matricula NULL, que esta regra aceita; o NOT VALID aqui evita a varredura e mantem as duas constraints desta migration com o mesmo comportamento.';

-- -----------------------------------------------------------------------------
-- Regra de negocio: saida exige solicitante. Isencao unica e SEMANTICA: saida
-- gerada por reconciliacao de conferencia (conferencia_id preenchido) nao tem
-- solicitante humano, porque ninguem retirou material, foi ajuste de inventario.
-- Sem a isencao a reconciliacao de divergencia negativa pararia de funcionar.
-- Nao existe isencao por DATA: quem cuida do passado e o NOT VALID.
-- -----------------------------------------------------------------------------
DO $migration_0075_saida$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'ck_estoque_mov_saida_solicitante'
       AND conrelid = 'public.estoque_movimentacoes'::regclass
  ) THEN
    ALTER TABLE estoque_movimentacoes
      ADD CONSTRAINT ck_estoque_mov_saida_solicitante
      CHECK (
        tipo <> 'saida'
        OR conferencia_id IS NOT NULL
        OR solicitante_matricula IS NOT NULL
      )
      NOT VALID;
  END IF;
END
$migration_0075_saida$;

COMMENT ON CONSTRAINT ck_estoque_mov_saida_solicitante ON estoque_movimentacoes IS
  'NOT VALID de proposito (06/10/2026): vale para linha NOVA e nao varre o passado. Toda saida gravada ANTES desta constraint tem solicitante_matricula NULL e VIOLA esta regra; essas linhas continuam existindo e isso e a escolha, nao um esquecimento. Rodar VALIDATE CONSTRAINT sem antes tratar as linhas antigas VAI FALHAR, e tratar linha antiga desta tabela exige desligar o gatilho estoque_mov_append_only (0074) de proposito, dentro da propria migration. A isencao conferencia_id IS NOT NULL e semantica: saida de reconciliacao de conferencia nao tem solicitante humano.';

-- -----------------------------------------------------------------------------
-- Conferencia depois de aplicar (nenhuma das duas escreve):
--
--   SELECT column_name, data_type, is_nullable
--     FROM information_schema.columns
--    WHERE table_schema = 'public'
--      AND table_name = 'estoque_movimentacoes'
--      AND column_name = 'solicitante_matricula';
--   -- espera: 1 linha, text, YES
--
--   SELECT conname, convalidated
--     FROM pg_constraint
--    WHERE conrelid = 'public.estoque_movimentacoes'::regclass
--      AND conname IN ('ck_estoque_mov_matricula_formato',
--                      'ck_estoque_mov_saida_solicitante')
--    ORDER BY conname;
--   -- espera: 2 linhas, convalidated = false nas duas
-- -----------------------------------------------------------------------------
