-- =============================================================================
-- Migration 0076: imutabilidade REAL das quatro trilhas de auditoria.
-- =============================================================================
-- Estende a 0074 (estoque_movimentacoes) para as trilhas das Fases 1 e 2. Ler a
-- 0074 inteira antes desta: o raciocinio das DUAS camadas, o de TRUNCATE nao
-- disparar gatilho de linha e o de privilegio nao mediar o acesso do DONO estao
-- la e nao se repetem aqui.
--
-- -----------------------------------------------------------------------------
-- 1. O QUE FOI MEDIDO (06/10/2026, neste repositorio, HEAD 723a108)
-- -----------------------------------------------------------------------------
-- `grep -rn "REVOKE" supabase/migrations/*.sql` devolve oito tabelas. Nenhuma
-- delas tem gatilho de append-only: o inventario de CREATE TRIGGER em
-- supabase/migrations/ lista dez gatilhos, e os nove que nao sao o da 0074 sao
-- de `atualizado_em`, de validacao de MFA e de invalidacao de cache geo. Ou
-- seja, antes desta migration a imutabilidade dessas trilhas era UMA linha de
-- REVOKE que nao alcanca o dono, e a aplicacao conecta como dono (ADR-0024,
-- janela da PRODESP; medicao em db/migrate.sh + ops/producao/banco.exemplo,
-- reproduzida no cabecalho da 0074).
--
-- Pior: no caso de `acesso_ficha` nem o REVOKE existe. Na 0005 ele esta DENTRO
-- de um bloco de comentario, como instrucao para um papel `app` que nunca foi
-- criado (db/auth-compat.sql cria anon, authenticated e service_role, os tres
-- NOLOGIN). E a 0025 cita `acesso_ficha` como "mesmo padrao" ao justificar o
-- proprio REVOKE, isto e, a casa documentou por anos um precedente que nunca
-- foi executado. Esta migration executa aquele REVOKE pela primeira vez.
--
-- -----------------------------------------------------------------------------
-- 2. O CRITERIO: nomeia EVENTO, nao tabela
-- -----------------------------------------------------------------------------
-- Uma tabela entra no escopo quando as DUAS coisas valem:
--   (a) cada linha registra um FATO JA OCORRIDO (tem `ocorreu_em`, nao tem
--       `atualizado_em` nem coluna de `estado`); e
--   (b) nenhum caminho legitimo do produto reescreve ou apaga a linha, medido
--       por varredura de UPDATE/DELETE/TRUNCATE em src/, scripts/, ops/ e db/.
--
-- Pelas duas, das oito tabelas com REVOKE entram QUATRO:
--
--   acesso_ficha        (0005)  INSERT unico em auditoria-repository.pg.ts:13.
--   triagem_eventos     (0025)  INSERT unico em triagem-repository.pg.ts:182.
--   ana_revisao_evento  (0029)  INSERT em ana-revisao-repository.pg.ts 549,
--                               680, 857.
--   postos_evento       (0031)  INSERT em postos-repository.pg.ts 366, 472,
--                               513, 545 e ana-revisao-repository.pg.ts:828.
--
-- E QUATRO ficam FORA, com o motivo medido, porque forcar imutabilidade nelas
-- quebraria o produto. O REVOKE que elas tem e, nestes quatro casos, uma
-- afirmacao ERRADA sobre a tabela, e isso esta anotado no COMMENT no fim deste
-- arquivo para a proxima pessoa nao repetir a leitura:
--
--   usuarios_papeis   (0023)  ESTADO. Tem `atualizado_em` e gatilho BEFORE
--                             UPDATE proprio (0023), e o produto faz upsert
--                             `ON CONFLICT (usuario_id) DO UPDATE SET papel`
--                             em usuarios-admin-repository.supabase.ts:117.
--                             Atribuicao de papel MUDA por desenho.
--   fichas_triagem    (0024)  ESTADO. Maquina de estados (`estado`,
--                             `decidida_em`, `atualizada_em`), com quatro
--                             UPDATE em triagem-repository.pg.ts (414, 515,
--                             579, 729).
--   triagem_locks     (0026)  MUTEX. Liberar o lock E apagar a linha: quatro
--                             DELETE em triagem-repository.pg.ts (371, 526,
--                             570, 740). Imutavel aqui travaria a revisao de
--                             ficha no primeiro lock.
--   cron_heartbeats   (0027)  SINAL DE VIDA com retencao de 7 dias declarada
--                             no cabecalho da 0027 e executada pelo DELETE em
--                             triagem-repository.pg.ts:678.
--
-- -----------------------------------------------------------------------------
-- 3. TRES CAMINHOS LEGITIMOS DE ESCRITA, e por que um gatilho identico ao da
--    0074 teria quebrado producao em vez de proteger a trilha
-- -----------------------------------------------------------------------------
-- (i) LGPD. `anonimizar_trilha_auditoria()` (0048, SECURITY DEFINER) faz UPDATE
--     nas QUATRO tabelas, pondo `ip` e `user_agent` em NULL depois do prazo de
--     retencao (art. 15 e 16 da LGPD, art. 6 III e V). Um gatilho que recusa
--     todo UPDATE recusaria o cumprimento de obrigacao legal em sistema de
--     orgao publico, e o sintoma apareceria primeiro em
--     tests/integration/anonimizar-trilha-postgres.test.ts.
--
--     Resolvido no gatilho, e nao com excecao de papel: o UPDATE passa SE a
--     unica diferenca entre OLD e NEW estiver em `ip` e `user_agent` E o valor
--     novo for NULL nos dois. A excecao e de MAO UNICA, so no sentido do NULL:
--     escrever um ip NOVO continua recusado, senao a porta da minimizacao
--     viraria porta para FORJAR origem de acesso. O que a excecao pode, no pior
--     caso, e ANTECIPAR a minimizacao (apagar PII de rede antes do prazo), que
--     destroi dado pessoal a mais e nunca fabrica dado: nao e adulteracao de
--     auditoria, porque quem, quando e o que permanecem intocaveis.
--
--     O QUE A EXCECAO NAO VERIFICA, de proposito: a idade da linha. Repetir o
--     prazo aqui criaria uma SEGUNDA fonte de verdade para a retencao, que hoje
--     e o parametro `dias_retencao` da 0048 (padrao 180, ajustavel na chamada).
--     Consequencia aceita e NOMEADA: quem conecta como dono pode apagar o `ip`
--     de um acesso de ontem, perdendo valor forense daquela janela. A contencao
--     disso nao e schema, e quem recebe a credencial de dono (ADR-0024).
--
-- (ii) Remocao de usuario. `DELETE /api/admin/usuarios/[id]`
--     (src/app/api/admin/usuarios/[id]/route.ts:247) chama
--     `supabaseAdmin().auth.admin.deleteUser`, que apaga a linha de
--     `auth.users`. Tres chaves estrangeiras das trilhas eram
--     `ON DELETE SET NULL` sobre `ator_id`:
--
--       triagem_eventos.ator_id      -> auth.users (0025)
--       ana_revisao_evento.ator_id   -> auth.users (0029)
--       postos_evento.ator_id        -> auth.users (0031)
--
--     Acao referencial de FK executa um UPDATE de verdade na tabela que
--     referencia, e DISPARA gatilho de linha. Com um gatilho igual ao da 0074 a
--     remocao de usuario comecaria a responder erro 500.
--
--     E o estado ANTERIOR a esta migration e pior que o erro: hoje, apagar um
--     usuario pelo painel APAGA A AUTORIA de todos os eventos que ele produziu,
--     em silencio, sem registro nenhum. Para o orgao isso e um caminho de
--     adulteracao de trilha disponivel na propria interface de administracao, e
--     e o defeito que estava por tras do pedido.
--
--     Resolvido tirando a chave estrangeira e MANTENDO a coluna, que e o
--     precedente escrito da casa nas 0067 e 0069 ("remove-se apenas a chave
--     estrangeira, e NAO a coluna"). A trilha passa a guardar o id do ator
--     mesmo depois de a conta deixar de existir, que e o que uma trilha deve
--     fazer. `DROP CONSTRAINT` nao toca nenhuma linha.
--
-- (iii) Reimportacao do inventario ANA. `ana_revisao_evento.estacao_id` era
--     `ON DELETE CASCADE` sobre `ana_revisao_estacao`, e
--     scripts/seed/importar_inventario_ana.py:491 apaga as estacoes do lote
--     quando a mesma planilha e reimportada. Hoje isso APAGA a trilha de
--     revisao da rodada anterior, por rotina de operacao. Mesmo tratamento:
--     a FK sai, a coluna fica, o evento sobrevive a estacao.
--
-- POR QUE NAO DETECTAR A ACAO REFERENCIAL DENTRO DO GATILHO: daria para
-- permitir (ii) e (iii) testando `pg_trigger_depth() > 1`, ja que acao de FK
-- roda como gatilho interno. Recusado: alem de reabrir exatamente as duas
-- adulteracoes descritas acima, qualquer gatilho de usuario envolvendo a
-- escrita elevaria a profundidade e passaria pela guarda. Guarda com porta dos
-- fundos documentada nao e guarda.
--
-- -----------------------------------------------------------------------------
-- 4. O QUE MAIS MUDA DE COMPORTAMENTO
-- -----------------------------------------------------------------------------
--   * `triagem_eventos.triagem_id` -> fichas_triagem CONTINUA `ON DELETE
--     RESTRICT`, de proposito: RESTRICT nao escreve na trilha, ele recusa a
--     exclusao da ficha la na origem, que e protecao e nao risco.
--   * `postos_evento.posto_id` ja estava sem FK desde a 0069, logo o CASCADE de
--     `postos` que escrevia na trilha nao existe mais. Nada a fazer.
--   * `acesso_ficha` nao tem FK nenhuma (`usuario_id` e TEXT desde a 0005).
--   * TRUNCATE continua possivel para o dono, como na 0074: nao dispara gatilho
--     de LINHA e privilegio nao vale contra o dono. Medido: nenhuma suite
--     TRUNCA estas quatro tabelas; tres suites as limpam com DELETE escopado,
--     e esses DELETE passam a desligar o gatilho explicitamente DENTRO de uma
--     transacao (ALTER TABLE ... DISABLE TRIGGER e transacional, entao um erro
--     no meio devolve o gatilho ligado em vez de deixar a suite seguinte verde
--     sobre guarda desligada).
--   * Migration futura que precise mexer em linha EXISTENTE destas tabelas
--     desliga o gatilho dela explicitamente, na propria transacao, e diz no
--     cabecalho por que. ADD COLUMN com default NULL nao precisa: nao e UPDATE.
--
-- -----------------------------------------------------------------------------
-- 5. ORDEM DE DEPLOY
-- -----------------------------------------------------------------------------
-- 1) aplicar esta migration no banco; 2) conferir no catalogo com as tres
-- consultas do fim deste arquivo; 3) so entao push do codigo. Nenhuma linha da
-- aplicacao depende dela. A ordem protege o inverso do de sempre: aplicar sem
-- conferir deixaria a gente afirmando ao orgao uma garantia que o banco pode
-- nao ter recebido. Migration commitada nao e migration aplicada.
--
-- As secoes abaixo estao nesta ordem porque `psql -f` sem BEGIN roda cada
-- comando em transacao propria: as FKs que escrevem na trilha saem ANTES de o
-- gatilho existir, para que uma falha no meio nunca deixe o banco com gatilho e
-- sem a correcao das FKs, o que derrubaria a remocao de usuario.
--
-- Idempotente (REVOKE e idempotente por natureza, DROP CONSTRAINT IF EXISTS,
-- CREATE OR REPLACE na funcao, pg_trigger guarda cada CREATE TRIGGER).
-- Reversao:
--   DROP TRIGGER IF EXISTS acesso_ficha_append_only       ON acesso_ficha;
--   DROP TRIGGER IF EXISTS triagem_eventos_append_only    ON triagem_eventos;
--   DROP TRIGGER IF EXISTS ana_revisao_evento_append_only ON ana_revisao_evento;
--   DROP TRIGGER IF EXISTS postos_evento_append_only      ON postos_evento;
--   DROP FUNCTION IF EXISTS trg_trilha_append_only();
--   As FKs removidas NAO voltam sozinhas, e nao devem: recria-las devolveria o
--   caminho de adulteracao descrito em 3(ii) e 3(iii). O REVOKE tambem nao se
--   desfaz: era privilegio que ninguem deveria ter.
-- Depende de: 0005, 0025, 0029, 0031 (as tabelas), 0048 (a excecao LGPD),
-- 0069 (que ja tirou o CASCADE de `postos` sobre `postos_evento`).
--
-- -----------------------------------------------------------------------------
-- 6. O QUE NAO FOI MEDIDO
-- -----------------------------------------------------------------------------
-- Nenhuma linha deste arquivo rodou contra um PostgreSQL de pe nesta bancada: a
-- maquina nao tem Docker, psql, initdb nem pg_isready (decisao do proprietario
-- de 01/10/2026). Quem mede no lugar dela sao duas coisas: o bloco DO da secao
-- A, que NOMEIA por RAISE WARNING toda concessao direta fora do dono no instante
-- da aplicacao, e tests/integration/trilhas-append-only-postgres.test.ts, no job
-- `integracao` do CI. Tambem NAO foi medido contra o banco de PRODUCAO da
-- PRODESP quais papeis tem hoje UPDATE/DELETE nestas quatro tabelas e se alguma
-- FK ali tem nome divergente do padrao: por isso a secao B tem, alem dos DROP
-- nomeados, uma varredura por ACAO REFERENCIAL que alcanca qualquer nome.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- SECAO A. Camada 1: privilegio. Declaratoria, como na 0025 e na 0074.
--
-- Vale registrar o limite desta camada sem rodeio: no PostgreSQL PUBLIC nao
-- recebe UPDATE nem DELETE em tabela por default, portanto este REVOKE e quase
-- sempre um no-op. Ele existe para (a) declarar a intencao no schema, (b)
-- retirar o privilegio no dia em que alguem der GRANT ... TO PUBLIC, e (c)
-- valer de verdade quando existir papel de aplicacao separado do dono. Quem
-- recusa hoje e a camada 2.
-- -----------------------------------------------------------------------------
REVOKE UPDATE, DELETE ON acesso_ficha       FROM PUBLIC;
REVOKE UPDATE, DELETE ON triagem_eventos    FROM PUBLIC;
REVOKE UPDATE, DELETE ON ana_revisao_evento FROM PUBLIC;
REVOKE UPDATE, DELETE ON postos_evento      FROM PUBLIC;

-- Mede e NOMEIA o que o REVOKE acima nao alcanca: concessao DIRETA a papel
-- nomeado. Le a ACL real (pg_class.relacl). Privilegio herdado de grupo nao
-- aparece na ACL e nem seria revogavel aqui, e por isso o teste de integracao
-- confere o EFETIVO por has_table_privilege.
--
-- Nao revoga papel nomeado por conta propria e nao derruba o deploy, pelas duas
-- razoes da 0074: a camada 2 recusa a escrita de qualquer forma, e remover em
-- silencio privilegio que alguma integracao do orgao possa usar apagaria
-- informacao que so o log guardaria. Decisao a quente vira REVOKE nomeado em
-- migration propria.
DO $$
DECLARE
  tabela   text;
  dono     text;
  linha    record;
  achados  int := 0;
BEGIN
  FOREACH tabela IN ARRAY ARRAY[
    'public.acesso_ficha',
    'public.triagem_eventos',
    'public.ana_revisao_evento',
    'public.postos_evento'
  ]
  LOOP
    SELECT pg_get_userbyid(c.relowner)
      INTO dono
      FROM pg_class c
     WHERE c.oid = tabela::regclass;

    FOR linha IN
      SELECT DISTINCT
             CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS papel,
             a.privilege_type AS privilegio
        FROM pg_class c
        CROSS JOIN LATERAL aclexplode(c.relacl) AS a
       WHERE c.oid = tabela::regclass
         AND a.privilege_type IN ('UPDATE', 'DELETE')
         AND a.grantee <> c.relowner
    LOOP
      achados := achados + 1;
      RAISE WARNING '0076: % tem % DIRETO em %, fora do dono (%). O gatilho de append-only recusa a escrita, mas o privilegio deveria sair: REVOKE % ON % FROM %.',
        linha.papel, linha.privilegio, tabela, dono, linha.privilegio, tabela, linha.papel;
    END LOOP;
  END LOOP;

  RAISE NOTICE '0076: concessoes diretas de UPDATE/DELETE fora do dono nas quatro trilhas = %.', achados;
END$$;


-- -----------------------------------------------------------------------------
-- SECAO B. Tirar da trilha toda chave estrangeira cuja ACAO REFERENCIAL
-- ESCREVE na trilha. Secao 3(ii) e 3(iii) do cabecalho.
--
-- `CASCADE`, `SET NULL` e `SET DEFAULT` fazem o banco APAGAR ou REESCREVER
-- linha ja gravada quando a outra ponta sai, e disparam gatilho de linha.
-- `NO ACTION` e `RESTRICT` nao escrevem nada: recusam a exclusao na origem, e
-- por isso FICAM (e o caso de triagem_eventos.triagem_id).
--
-- NENHUM DADO E ALTERADO: `DROP CONSTRAINT` nao toca linha (a frase e da 0069).
-- -----------------------------------------------------------------------------

-- Pelo nome do padrao do PostgreSQL, explicitas para serem auditaveis.
ALTER TABLE triagem_eventos    DROP CONSTRAINT IF EXISTS triagem_eventos_ator_id_fkey;
ALTER TABLE ana_revisao_evento DROP CONSTRAINT IF EXISTS ana_revisao_evento_ator_id_fkey;
ALTER TABLE ana_revisao_evento DROP CONSTRAINT IF EXISTS ana_revisao_evento_estacao_id_fkey;
ALTER TABLE postos_evento      DROP CONSTRAINT IF EXISTS postos_evento_ator_id_fkey;

-- Rede de seguranca da 0069, generalizada: se em alguma base o nome divergir, o
-- DROP nomeado nao a alcanca e ela sobreviveria calada. Esta varredura nao
-- pergunta pelo NOME nem pelo ALVO, e sim pela ACAO, que e o fato que importa.
DO $$
DECLARE
  r        record;
  removidas int := 0;
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass AS tabela,
           c.conname,
           c.confdeltype,
           c.confupdtype,
           (SELECT a.attname FROM pg_attribute a
             WHERE a.attrelid = c.conrelid AND a.attnum = c.conkey[1]) AS coluna
      FROM pg_constraint c
     WHERE c.contype = 'f'
       AND c.conrelid = ANY (ARRAY[
             'public.acesso_ficha',
             'public.triagem_eventos',
             'public.ana_revisao_evento',
             'public.postos_evento'
           ]::regclass[])
       AND (c.confdeltype IN ('c', 'n', 'd') OR c.confupdtype IN ('c', 'n', 'd'))
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I', r.tabela, r.conname);
    removidas := removidas + 1;
    RAISE WARNING '0076: FK %.% (%) removida: acao ON DELETE=% ON UPDATE=% reescrevia linha ja gravada da trilha. A COLUNA permanece, com o id preservado (precedente 0067 e 0069).',
      r.tabela, r.coluna, r.conname, r.confdeltype, r.confupdtype;
  END LOOP;

  RAISE NOTICE '0076: chaves estrangeiras com acao de escrita removidas das trilhas = %.', removidas;
END$$;


-- -----------------------------------------------------------------------------
-- SECAO C. Camada 2: o gatilho. Recusa inclusive para o DONO, que e com quem a
-- aplicacao conecta hoje.
--
-- Codigo de erro 'check_violation' (23514) de proposito, como na 0074, e NAO
-- 'insufficient_privilege' (42501): o 42501 e o que a camada 1 produziria, e
-- regua que julga a recusa so pelo codigo nao distingue uma camada da outra. A
-- mensagem carrega o sentinela `trilha-append-only:<tabela>`, que NENHUMA outra
-- camada produz (privilegio diz "permission denied for table", FK diz "violates
-- foreign key constraint", CHECK diz o nome da constraint), e e por esse
-- sentinela que o teste nomeia quem recusou.
--
-- Uma funcao serve as quatro tabelas: a excecao LGPD e expressa sobre
-- `to_jsonb(OLD)` e `to_jsonb(NEW)`, logo independe do TIPO de `ip` (TEXT na
-- 0005, INET nas outras tres) e de a coluna existir. O cast `::text` nas chaves
-- e obrigatorio: `jsonb - 'ip'` com literal sem tipo e ambiguo entre os
-- operadores `jsonb - text`, `jsonb - text[]` e `jsonb - integer`.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_trilha_append_only()
RETURNS TRIGGER AS $$
DECLARE
  antes  jsonb;
  depois jsonb;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    antes  := to_jsonb(OLD);
    depois := to_jsonb(NEW);

    -- Excecao UNICA e de mao unica: anonimizacao de PII de rede (0048).
    -- Tudo fora de `ip` e `user_agent` tem de estar IDENTICO, e os dois tem de
    -- terminar NULL. Sem a terceira condicao um UPDATE que nao muda nada
    -- passaria, o que nao faz mal nenhum mas tornaria a excecao mais larga que
    -- o motivo dela.
    --
    -- ACOPLAMENTO MEDIDO EM 06/10/2026, e esta e a unica vez que ele esta
    -- escrito: a terceira condicao so e compativel com a rotina de retencao
    -- porque a 0048 filtra `AND (ip IS NOT NULL OR user_agent IS NOT NULL)` no
    -- UPDATE das QUATRO tabelas. Quem tirar aquele filtro faz a rotina de LGPD
    -- reprocessar linha ja anonimizada e ESTOURAR aqui, com erro de adulteracao
    -- de auditoria no log de uma rotina legitima. Mexer na 0048 ou no caso de
    -- uso `anonimizar-trilha-auditoria` pede reler esta condicao.
    -- NAO MEDIDO: nao existe guarda automatica desse acoplamento (exigiria
    -- medir o SQL da rotina a cada execucao). A prova de hoje e a leitura da
    -- 0048 mais o caso de integracao que roda a anonimizacao DUAS vezes e
    -- afirma que a segunda nao acha nada: com o gatilho ligado, ele passa a
    -- reprovar quem tirar o filtro. O veredito dele sai no job de integracao
    -- com Postgres do CI, lido job por job, porque a bancada desta maquina nao
    -- tem Postgres (01/10/2026).
    IF  (antes - 'ip'::text - 'user_agent'::text) = (depois - 'ip'::text - 'user_agent'::text)
    AND (depois ->> 'ip') IS NULL
    AND (depois ->> 'user_agent') IS NULL
    AND ((antes ->> 'ip') IS NOT NULL OR (antes ->> 'user_agent') IS NOT NULL)
    THEN
      RETURN NEW;
    END IF;
  END IF;

  RAISE EXCEPTION
    'trilha-append-only:%: % recusado. Trilha de auditoria e imutavel: o evento registra fato ja ocorrido e correcao se faz com linha NOVA. A unica escrita aceita e a anonimizacao de ip/user_agent para NULL (LGPD, migration 0048). Alteracao direta no banco sai como tentativa de adulteracao de auditoria.',
    TG_TABLE_NAME, TG_OP
  USING ERRCODE = 'check_violation';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION trg_trilha_append_only() IS
  'Recusa UPDATE e DELETE nas trilhas de auditoria (acesso_ficha, triagem_eventos, ana_revisao_evento, postos_evento), inclusive para o dono da tabela, porque privilegio nao media o acesso do dono e a aplicacao conecta com o papel dono. Unica escrita aceita: anonimizacao de ip/user_agent para NULL (LGPD, 0048), e so no sentido do NULL. Backfill legitimo desliga o gatilho explicitamente, na propria migration.';

-- A guarda de idempotencia pergunta pelo par (nome, tabela): `tgname` nao e
-- unico no banco, so por tabela. Perguntando so pelo nome, um gatilho homonimo
-- em outra tabela faria esta migration pular o CREATE e sair verde sem gatilho.
DO $$
DECLARE
  par       record;
  criados   int := 0;
BEGIN
  FOR par IN
    SELECT * FROM (VALUES
      ('acesso_ficha',       'acesso_ficha_append_only'),
      ('triagem_eventos',    'triagem_eventos_append_only'),
      ('ana_revisao_evento', 'ana_revisao_evento_append_only'),
      ('postos_evento',      'postos_evento_append_only')
    ) AS t(tabela, gatilho)
  LOOP
    IF NOT EXISTS (
      SELECT 1
        FROM pg_trigger
       WHERE tgname = par.gatilho
         AND tgrelid = ('public.' || par.tabela)::regclass
         AND NOT tgisinternal
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION trg_trilha_append_only()',
        par.gatilho, par.tabela
      );
      criados := criados + 1;
    END IF;
  END LOOP;

  RAISE NOTICE '0076: gatilhos de append-only criados nesta execucao = % (de 4; os demais ja existiam).', criados;
END$$;


-- -----------------------------------------------------------------------------
-- SECAO D. Os COMMENT, reescritos aqui porque migration aplicada nao se edita.
-- `db/migrate.sh` reaplica os arquivos em ordem alfabetica a cada subida, entao
-- a 0005, a 0025, a 0029 e a 0031 passam antes e estes COMMENT sao os que ficam.
--
-- Os quatro das tabelas FORA do escopo tambem sao reescritos: o REVOKE delas
-- afirma imutabilidade que o produto contradiz por desenho, e COMMENT que mente
-- e pior que COMMENT ausente.
-- -----------------------------------------------------------------------------
COMMENT ON TABLE acesso_ficha IS
  'Trilha de auditoria LGPD de acesso a ficha de posto (append-only). UPDATE e DELETE recusados pelo gatilho acesso_ficha_append_only (0076) e revogados do PUBLIC. Excecao unica: anonimizacao de ip/user_agent para NULL apos o prazo de retencao (0048). ATENCAO: o REVOKE sugerido no comentario da 0005 nunca foi executado, e a 0076 e a primeira vez que esta tabela tem imutabilidade de fato.';

COMMENT ON TABLE triagem_eventos IS
  'Audit trail append-only de transicoes em fichas_triagem. UPDATE e DELETE recusados pelo gatilho triagem_eventos_append_only (0076), nao mais apenas pelo REVOKE, que nao alcanca o dono da tabela. `ator_id` deixou de ser chave estrangeira na 0076 (o ON DELETE SET NULL apagava a autoria do evento quando a conta era removida pelo painel); o id continua gravado. Excecao unica de escrita: anonimizacao de ip/user_agent para NULL (0048).';

COMMENT ON TABLE ana_revisao_evento IS
  'Audit trail append-only das acoes sobre estacoes ANA. UPDATE e DELETE recusados pelo gatilho ana_revisao_evento_append_only (0076). Na 0076 sairam duas chaves estrangeiras que reescreviam a trilha: `ator_id` (ON DELETE SET NULL apagava a autoria) e `estacao_id` (ON DELETE CASCADE apagava a trilha da rodada anterior quando a planilha era reimportada); as colunas e os ids continuam gravados. Excecao unica de escrita: anonimizacao de ip/user_agent para NULL (0048).';

COMMENT ON TABLE postos_evento IS
  'Audit trail append-only de toda mudanca em postos. UPDATE e DELETE recusados pelo gatilho postos_evento_append_only (0076). `posto_id` deixou de ser chave estrangeira na 0069 e `ator_id` na 0076; os ids continuam gravados. Excecao unica de escrita: anonimizacao de ip/user_agent para NULL (0048). Atende governo.md secao 4 (LGPD) e OWASP A09.';

COMMENT ON TABLE usuarios_papeis IS
  'Atribuicao de papel por usuario. NAO e trilha e NAO e append-only, apesar do REVOKE da 0023: tem `atualizado_em` com gatilho proprio e o painel de administracao faz upsert do papel. Quem registra a mudanca de papel de forma imutavel e a trilha, nao esta tabela. Avaliada e excluida do escopo da 0076.';

COMMENT ON TABLE fichas_triagem IS
  'Staging de ficha pre-aprovacao. NAO e append-only, apesar do REVOKE da 0024: e maquina de estados (`estado`, `decidida_em`, `atualizada_em`) e o produto a atualiza em quatro pontos. A imutabilidade do ciclo de vida mora em triagem_eventos. Avaliada e excluida do escopo da 0076.';

COMMENT ON TABLE triagem_locks IS
  'Lock pessimista de revisao. NAO e append-only, apesar do REVOKE da 0026: apagar a linha E o modo de liberar o lock, em quatro pontos do produto e no cron de expiracao. Avaliada e excluida do escopo da 0076.';

COMMENT ON TABLE cron_heartbeats IS
  'Sinal de vida dos jobs cron. NAO e append-only, apesar do REVOKE da 0027: o proprio cabecalho da 0027 define retencao de 7 dias, executada por DELETE. Avaliada e excluida do escopo da 0076.';


-- -----------------------------------------------------------------------------
-- SECAO E. Conferencia depois de aplicar. Nenhuma das tres escreve.
--
--   -- 1) os quatro gatilhos, habilitados ('O'):
--   SELECT c.relname, t.tgname, t.tgenabled
--     FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
--    WHERE NOT t.tgisinternal
--      AND t.tgname LIKE '%_append_only'
--    ORDER BY c.relname;
--   -- espera: 4 linhas (acesso_ficha, ana_revisao_evento, postos_evento,
--   --         triagem_eventos), todas com tgenabled = 'O'.
--   --         estoque_movimentacoes aparece como quinta, da 0074.
--
--   -- 2) nenhuma FK saindo das trilhas com acao que ESCREVE nelas:
--   SELECT c.conrelid::regclass AS tabela, c.conname, c.confdeltype, c.confupdtype
--     FROM pg_constraint c
--    WHERE c.contype = 'f'
--      AND c.conrelid = ANY (ARRAY['public.acesso_ficha','public.triagem_eventos',
--                                  'public.ana_revisao_evento','public.postos_evento']::regclass[])
--      AND (c.confdeltype IN ('c','n','d') OR c.confupdtype IN ('c','n','d'));
--   -- espera: zero linha. (triagem_eventos.triagem_id permanece, com
--   --          confdeltype = 'r' (RESTRICT), e NAO deve aparecer aqui.)
--
--   -- 3) nenhuma concessao direta de UPDATE/DELETE fora do dono:
--   SELECT c.relname,
--          CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS papel,
--          a.privilege_type
--     FROM pg_class c
--     CROSS JOIN LATERAL aclexplode(c.relacl) AS a
--    WHERE c.oid = ANY (ARRAY['public.acesso_ficha','public.triagem_eventos',
--                             'public.ana_revisao_evento','public.postos_evento']::regclass[])
--      AND a.privilege_type IN ('UPDATE', 'DELETE')
--      AND a.grantee <> c.relowner;
--   -- espera: zero linha.
-- -----------------------------------------------------------------------------
