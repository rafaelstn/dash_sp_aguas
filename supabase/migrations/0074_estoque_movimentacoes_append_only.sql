-- =============================================================================
-- Migration 0074, modulo Estoque: append-only do ledger garantido pelo BANCO.
-- =============================================================================
-- Contexto (medido em 05/10/2026, revisao de seguranca): o COMMENT da 0059 diz
-- que o ledger e append-only, "sem UPDATE/DELETE pelo app", e isso era verdade
-- sobre o REPOSITORIO e nada sobre o banco. Medido: nenhuma migration do modulo
-- Estoque (0054 a 0073) tem REVOKE, e nao havia gatilho impedindo alteracao,
-- entao UPDATE e DELETE diretos na trilha de auditoria do estoque passavam.
-- Precedente da casa que esta migration estende: 0023, 0024, 0025, 0026, 0027,
-- 0029 e 0031, todas com REVOKE UPDATE, DELETE ... FROM PUBLIC.
--
-- DUAS camadas, e o porque de nao ser so o REVOKE da 0025:
--   1) REVOKE UPDATE, DELETE FROM PUBLIC. Vale para papel NAO-DONO. Fica aqui
--      pelo mesmo motivo da 0025: declarar a intencao no schema e proteger o dia
--      em que existir papel de aplicacao separado do dono.
--   2) Gatilho BEFORE UPDATE OR DELETE que RECUSA. Esta camada existe porque a
--      primeira nao alcanca o papel que a aplicacao usa hoje. Medido no
--      repositorio: ops/producao/banco.exemplo cria banco e papel com
--      POSTGRES_USER (spaguas) e db/migrate.sh aplica as migrations com esse
--      mesmo papel, logo ele e o DONO das tabelas; a DATABASE_URL da aplicacao
--      carrega a MESMA senha de POSTGRES_PASSWORD (rodape do banco.exemplo), e
--      no CI a TEST_DATABASE_URL e literalmente spaguas. Nao existe papel de
--      login nao-dono em lugar nenhum do repositorio: db/auth-compat.sql so cria
--      anon, authenticated e service_role, os tres NOLOGIN. Privilegio de tabela
--      nao media o acesso do DONO, portanto sem a camada 2 esta migration nao
--      recusaria nada de ninguem: seria declaracao, nao garantia.
--
-- O QUE O GATILHO MUDA DE COMPORTAMENTO (ler antes de aplicar):
--   * DELETE direto de um estoque_locais referenciado por movimentacao passa a
--     FALHAR. As FKs local_origem e local_destino sao ON DELETE SET NULL, ou
--     seja apagar um local reescrevia linha JA GRAVADA do ledger (origem e
--     destino viravam NULL, em silencio). Pelo produto isso nunca acontecia: o
--     repositorio recusa antes, com LocalEmUso (estoque-locais-repository.pg.ts,
--     remover(), que consulta estoque_movimentacoes de proposito). O mesmo vale
--     para conferencia_id, tambem SET NULL: nada no produto apaga conferencia
--     (medido, so existe DELETE de estoque_conferencia_itens).
--   * TRUNCATE continua possivel para o dono, de proposito: tres suites de
--     integracao limpam a base com TRUNCATE ... CASCADE. TRUNCATE nao dispara
--     gatilho de LINHA e privilegio nao vale contra o dono. NAO MEDIDO contra
--     banco de pe nesta bancada (sem Docker e sem psql): se esta afirmacao
--     estiver errada, o sintoma no CI e o beforeEach das suites de integracao do
--     estoque falhando com a mensagem deste gatilho, e nao o teste de append-only
--     falhando.
--   * Correcao de lancamento continua sendo linha NOVA tipo 'ajuste', como a
--     0059 e a ADR 0020 definem. Nada no produto faz UPDATE ou DELETE nesta
--     tabela (medido por varredura em src/, scripts/ e ops/).
--   * A anonimizacao de PII da trilha (0048) NAO toca esta tabela, e nem teria o
--     que anonimizar: estoque_movimentacoes nao tem coluna ip nem user_agent.
--   * Migration futura que precise mexer em linha EXISTENTE (backfill) tem de
--     desligar o gatilho explicitamente dentro da propria transacao
--     (ALTER TABLE estoque_movimentacoes DISABLE TRIGGER estoque_mov_append_only)
--     e dizer no cabecalho por que. Coluna nova com default NULL nao precisa:
--     ADD COLUMN nao e UPDATE.
--
-- ORDEM DE DEPLOY: 1) aplicar esta migration no banco, 2) confirmar no catalogo
-- (as duas consultas no fim deste arquivo), 3) so entao push do codigo. Nenhuma
-- linha da aplicacao depende dela, e e justamente essa a medicao acima, entao a
-- ordem aqui protege o inverso: aplicar sem conferir deixaria a gente afirmando
-- ao orgao uma garantia que o banco pode nao ter recebido. Migration commitada
-- != migration aplicada.
--
-- Idempotente (REVOKE e idempotente por natureza, CREATE OR REPLACE na funcao,
-- pg_trigger guarda o CREATE TRIGGER). Reversivel.
-- Reversao:
--   DROP TRIGGER IF EXISTS estoque_mov_append_only ON estoque_movimentacoes;
--   DROP FUNCTION IF EXISTS trg_estoque_mov_append_only();
--   O REVOKE do PUBLIC nao se desfaz sozinho, e nao deve: era privilegio que
--   ninguem deveria ter. Refaze-lo seria GRANT a mao, nomeando o papel.
-- Depende de: 0059 (estoque_movimentacoes), 0064 (conferencia_id).
--
-- O QUE NAO FOI MEDIDO: nenhuma linha deste arquivo rodou contra um PostgreSQL
-- de pe. A bancada de 05/10/2026 nao tem Docker, psql, initdb nem pg_isready
-- (conferido por command -v), decisao do Rafael de 01/10/2026, entao a pergunta
-- "quais papeis tem hoje UPDATE e DELETE nesta tabela, direto ou herdado de
-- grupo" ficou NAO MEDIDA contra banco nenhum. O que foi medido e que o
-- repositorio nunca concedeu nada nesta tabela: nao existe GRANT citando
-- estoque_movimentacoes em supabase/migrations/ nem em db/. Quem mede no lugar
-- da bancada sao duas coisas: o bloco DO abaixo, que NOMEIA por RAISE WARNING
-- toda concessao direta fora do dono no instante da aplicacao, e o teste
-- tests/integration/estoque-movimentacoes-append-only-postgres.test.ts, que no
-- job `integracao` do CI afirma o estado do catalogo e exige a recusa de UPDATE
-- e de DELETE pelo papel com que a aplicacao conecta.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Camada 1: privilegio. Forma da 0025.
-- -----------------------------------------------------------------------------
REVOKE UPDATE, DELETE ON estoque_movimentacoes FROM PUBLIC;

-- Mede e NOMEIA o que o REVOKE acima nao alcanca: concessao DIRETA a papel
-- nomeado. Le a ACL real da tabela (pg_class.relacl), que e a lista das
-- concessoes diretas, inclusive PUBLIC (grantee = 0); privilegio herdado de
-- grupo nao aparece na ACL e nem seria revogavel nesta tabela, e por isso o
-- teste de integracao confere o EFETIVO por has_table_privilege.
--
-- Este bloco nao revoga papel nomeado por conta propria e nao derruba o deploy,
-- por duas razoes medidas: a camada 2 recusa a escrita de qualquer forma, e
-- remover em silencio privilegio que alguma integracao do orgao possa estar
-- usando apagaria informacao que so o log guardaria. Decisao a quente vira
-- REVOKE nomeado em migration propria.
DO $$
DECLARE
  dono     text;
  linha    record;
  achados  int := 0;
BEGIN
  SELECT pg_get_userbyid(c.relowner)
    INTO dono
    FROM pg_class c
   WHERE c.oid = 'public.estoque_movimentacoes'::regclass;

  FOR linha IN
    SELECT DISTINCT
           CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS papel,
           a.privilege_type AS privilegio
      FROM pg_class c
      CROSS JOIN LATERAL aclexplode(c.relacl) AS a
     WHERE c.oid = 'public.estoque_movimentacoes'::regclass
       AND a.privilege_type IN ('UPDATE', 'DELETE')
       AND a.grantee <> c.relowner
  LOOP
    achados := achados + 1;
    RAISE WARNING '0074: % tem % DIRETO em estoque_movimentacoes, fora do dono (%). O gatilho estoque_mov_append_only recusa a escrita, mas o privilegio deveria sair: REVOKE % ON estoque_movimentacoes FROM %.',
      linha.papel, linha.privilegio, dono, linha.privilegio, linha.papel;
  END LOOP;

  RAISE NOTICE '0074: dono de estoque_movimentacoes = %; concessoes diretas de UPDATE/DELETE fora do dono = %.',
    dono, achados;
END$$;

-- -----------------------------------------------------------------------------
-- Camada 2: gatilho. Recusa inclusive para o dono, que e com quem a aplicacao
-- conecta hoje. Forma do gatilho validador da 0023 (RAISE EXCEPTION com
-- ERRCODE = 'check_violation', guarda de idempotencia por pg_trigger).
--
-- O codigo de erro e 'check_violation' (23514) de proposito, e nao
-- 'insufficient_privilege' (42501): o 42501 e o que a camada 1 produziria, e
-- regua que julga a recusa so pelo codigo nao distingue uma camada da outra.
-- A assercao do teste nomeia a camada por presenca, nao pelo codigo.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_estoque_mov_append_only()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'estoque_movimentacoes e append-only (trilha de auditoria): % direto no ledger sai como tentativa de adulteracao de auditoria. Correcao se faz com linha NOVA tipo ajuste, com motivo.',
    TG_OP
  USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION trg_estoque_mov_append_only() IS
  'Recusa UPDATE e DELETE em estoque_movimentacoes, inclusive para o dono da tabela (privilegio nao media o acesso do dono, e a aplicacao conecta com o papel dono). Backfill legitimo desliga o gatilho explicitamente, na propria migration.';

DO $$
BEGIN
  -- A guarda pergunta pelo par (nome, tabela): tgname nao e unico no banco, so
  -- por tabela. Perguntando so pelo nome, um gatilho homonimo em outra tabela
  -- faria esta migration pular o CREATE e sair verde sem gatilho nenhum aqui.
  IF NOT EXISTS (
    SELECT 1
      FROM pg_trigger
     WHERE tgname = 'estoque_mov_append_only'
       AND tgrelid = 'public.estoque_movimentacoes'::regclass
       AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER estoque_mov_append_only
    BEFORE UPDATE OR DELETE ON estoque_movimentacoes
    FOR EACH ROW EXECUTE FUNCTION trg_estoque_mov_append_only();
  END IF;
END$$;

-- O COMMENT da tabela e reescrito aqui, e nao na 0059, porque migration
-- aplicada nao se edita. O migrate roda os arquivos em ordem alfabetica a cada
-- subida, entao a 0059 passa primeiro e este COMMENT e o que fica.
COMMENT ON TABLE estoque_movimentacoes IS
  'Ledger append-only do estoque (trilha de auditoria). XOR unidade/material. Correcao vira nova linha `ajuste` com motivo. UPDATE e DELETE recusados pelo gatilho estoque_mov_append_only (0074) e revogados do PUBLIC: manipulacao direta no banco sai como tentativa de adulteracao de auditoria.';

-- -----------------------------------------------------------------------------
-- Conferencia depois de aplicar (nenhuma das duas escreve):
--
--   SELECT tgname, tgenabled
--     FROM pg_trigger
--    WHERE tgrelid = 'public.estoque_movimentacoes'::regclass
--      AND NOT tgisinternal;
--   -- espera: estoque_mov_append_only, tgenabled = 'O'
--
--   SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS papel,
--          a.privilege_type
--     FROM pg_class c
--     CROSS JOIN LATERAL aclexplode(c.relacl) AS a
--    WHERE c.oid = 'public.estoque_movimentacoes'::regclass
--      AND a.privilege_type IN ('UPDATE', 'DELETE')
--      AND a.grantee <> c.relowner;
--   -- espera: zero linha
-- -----------------------------------------------------------------------------
