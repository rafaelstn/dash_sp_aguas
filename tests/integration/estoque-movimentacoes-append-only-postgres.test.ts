/**
 * Append-only do ledger `estoque_movimentacoes` contra POSTGRES REAL (0074).
 *
 * Por que existe: ate 05/10/2026 o "append-only" do ledger era ausencia de
 * UPDATE/DELETE no repositorio, e nada no banco. O COMMENT da 0059 afirmava a
 * garantia ao leitor (e nos a afirmamos ao orgao), sem nenhuma linha de schema
 * sustentando. A 0074 poe duas camadas, e este arquivo mede as duas.
 *
 * O cuidado que decide o valor deste teste: ele NAO julga a recusa pelo codigo
 * de erro. Codigo igual em duas camadas cega a regua, entao cada caso nomeia a
 * camada por PRESENCA: afirma que o privilegio de UPDATE/DELETE CONTINUA valendo
 * para esta conexao (porque ela e o dono da tabela, e privilegio nao media
 * acesso do dono), afirma que o gatilho existe no catalogo, e prova a causa
 * desligando o gatilho dentro de uma transacao desfeita, onde o MESMO UPDATE
 * passa. Nao sobra outra camada que possa ter recusado.
 *
 * E a mutacao reproduz o estado que a regua descreve: cada caso INSERE a linha
 * antes de tentar alterar. O gatilho e FOR EACH ROW, entao UPDATE que casa ZERO
 * linha nao dispara nada e sairia verde sem medir a guarda.
 *
 * Roda apenas com `TEST_DATABASE_URL` apontando para um Postgres descartavel
 * com as migrations aplicadas; sem a variavel, o arquivo e pulado.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import postgres, { type Sql } from 'postgres';

const URL_TESTE = process.env.TEST_DATABASE_URL ?? '';
const rodar = URL_TESTE.length > 0 ? describe : describe.skip;

process.env.DATABASE_URL = URL_TESTE;

const TABELA = 'public.estoque_movimentacoes';

rodar('estoque_movimentacoes e append-only no banco (0074)', () => {
  let sql: Sql;
  let localId: string;
  let materialId: string;
  let movId: string;

  beforeAll(async () => {
    sql = postgres(URL_TESTE, { max: 3, prepare: false });
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  beforeEach(async () => {
    // TRUNCATE nao dispara gatilho de LINHA: se disparasse, a limpeza das outras
    // tres suites de integracao do estoque quebraria aqui, e este beforeEach e o
    // primeiro lugar onde isso apareceria.
    await sql`TRUNCATE estoque_conferencia_itens, estoque_conferencias,
                       estoque_movimentacoes, estoque_saldos, estoque_unidades,
                       estoque_materiais, estoque_locais RESTART IDENTITY CASCADE`;

    const locais = await sql<{ id: string }[]>`
      INSERT INTO estoque_locais (unidade, sala, rotulo)
      VALUES ('PENHA', 'SALA 1', 'PENHA / SALA 1')
      RETURNING id
    `;
    localId = locais[0]!.id;

    const materiais = await sql<{ id: string }[]>`
      INSERT INTO estoque_materiais (descricao, natureza)
      VALUES ('Cabo coaxial 10m', 'quantificavel')
      RETURNING id
    `;
    materialId = materiais[0]!.id;

    const movs = await sql<{ id: string }[]>`
      INSERT INTO estoque_movimentacoes
        (tipo, material_id, quantidade, local_destino, motivo, usuario_id)
      VALUES
        ('entrada', ${materialId}::uuid, 5, ${localId}::uuid, 'carga inicial', gen_random_uuid())
      RETURNING id
    `;
    movId = movs[0]!.id;
  });

  // ---------------------------------------------------------------------------
  // Estado que as assercoes de recusa interpretam. Medir isto ANTES e o que
  // impede "provei a recusa" quando quem recusou foi outra camada.
  // ---------------------------------------------------------------------------
  it('a conexao do teste e o papel DONO da tabela, como a aplicacao conecta', async () => {
    const [papeis] = await sql<{ conectado: string; dono: string }[]>`
      SELECT current_user AS conectado, pg_get_userbyid(c.relowner) AS dono
        FROM pg_class c
       WHERE c.oid = ${TABELA}::regclass
    `;
    // Esta assercao se INVERTE no dia em que existir papel de aplicacao separado
    // do dono (hoje nao existe: db/auth-compat.sql so cria anon, authenticated e
    // service_role, os tres NOLOGIN). Quando inverter, a camada que recusa passa
    // a ser o privilegio, e os dois casos abaixo precisam ser revistos, nao
    // apagados.
    expect(papeis!.conectado).toBe(papeis!.dono);
  });

  it('nenhuma concessao DIRETA de UPDATE ou DELETE fora do dono', async () => {
    const concessoes = await sql<{ papel: string; privilegio: string }[]>`
      SELECT CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS papel,
             a.privilege_type AS privilegio
        FROM pg_class c
        CROSS JOIN LATERAL aclexplode(c.relacl) AS a
       WHERE c.oid = ${TABELA}::regclass
         AND a.privilege_type IN ('UPDATE', 'DELETE')
         AND a.grantee <> c.relowner
    `;
    // Compara a projecao, e nao o resultado cru: o Result do postgres.js e um
    // Array com propriedades proprias (count, command, columns), e toEqual([])
    // sobre ele reprovaria por elas. Mapear tambem poe o papel e o privilegio
    // na mensagem de falha, que e o que o operador precisa ler.
    expect(concessoes.map((c) => `${c.papel}:${c.privilegio}`)).toEqual([]);
  });

  it('o gatilho da 0074 existe e esta habilitado', async () => {
    const gatilhos = await sql<{ tgname: string; tgenabled: string }[]>`
      SELECT tgname, tgenabled
        FROM pg_trigger
       WHERE tgrelid = ${TABELA}::regclass
         AND NOT tgisinternal
    `;
    expect(gatilhos.map((g) => g.tgname)).toContain('estoque_mov_append_only');
    expect(gatilhos.find((g) => g.tgname === 'estoque_mov_append_only')?.tgenabled).toBe('O');
  });

  // ---------------------------------------------------------------------------
  // A recusa, pelo papel com que a aplicacao conecta.
  // ---------------------------------------------------------------------------
  it('UPDATE na linha existente e recusado, e a linha nao muda', async () => {
    // Privilegio PRESENTE: nao e a camada 1 que vai recusar.
    const [priv] = await sql<{ pode: boolean }[]>`
      SELECT has_table_privilege(current_user, ${TABELA}, 'UPDATE') AS pode
    `;
    expect(priv!.pode).toBe(true);

    await expect(
      sql`UPDATE estoque_movimentacoes SET quantidade = 999 WHERE id = ${movId}::uuid`,
    ).rejects.toMatchObject({ message: expect.stringContaining('append-only') });

    const [depois] = await sql<{ quantidade: number; total: string }[]>`
      SELECT quantidade, (SELECT COUNT(*) FROM estoque_movimentacoes)::text AS total
        FROM estoque_movimentacoes WHERE id = ${movId}::uuid
    `;
    expect(depois!.quantidade).toBe(5);
    expect(depois!.total).toBe('1');
  });

  it('DELETE da linha existente e recusado, e a linha continua la', async () => {
    const [priv] = await sql<{ pode: boolean }[]>`
      SELECT has_table_privilege(current_user, ${TABELA}, 'DELETE') AS pode
    `;
    expect(priv!.pode).toBe(true);

    await expect(
      sql`DELETE FROM estoque_movimentacoes WHERE id = ${movId}::uuid`,
    ).rejects.toMatchObject({ message: expect.stringContaining('append-only') });

    const [restam] = await sql<{ total: string }[]>`
      SELECT COUNT(*)::text AS total FROM estoque_movimentacoes WHERE id = ${movId}::uuid
    `;
    expect(restam!.total).toBe('1');
  });

  it('quem recusa e o GATILHO: desligado, o mesmo UPDATE passa (transacao desfeita)', async () => {
    // Controle causal. Sem ele, "rejects" com mensagem combinada ainda deixaria
    // em aberto se outra camada (privilegio, RLS, constraint) recusou.
    const SENTINELA = 'desfazer-de-proposito';
    let afetadas = -1;
    await expect(
      sql.begin(async (tx) => {
        await tx.unsafe('ALTER TABLE estoque_movimentacoes DISABLE TRIGGER estoque_mov_append_only');
        const r = await tx`
          UPDATE estoque_movimentacoes SET quantidade = 999 WHERE id = ${movId}::uuid
        `;
        afetadas = r.count;
        throw new Error(SENTINELA);
      }),
    ).rejects.toThrow(SENTINELA);

    expect(afetadas).toBe(1);

    // A transacao desfeita devolve gatilho habilitado e linha intacta.
    const [estado] = await sql<{ tgenabled: string; quantidade: number }[]>`
      SELECT t.tgenabled,
             (SELECT quantidade FROM estoque_movimentacoes WHERE id = ${movId}::uuid) AS quantidade
        FROM pg_trigger t
       WHERE t.tgrelid = ${TABELA}::regclass
         AND t.tgname = 'estoque_mov_append_only'
    `;
    expect(estado!.tgenabled).toBe('O');
    expect(estado!.quantidade).toBe(5);
  });

  // ---------------------------------------------------------------------------
  // Controles que DEVEM passar: guarda que trava o produto nao e guarda.
  // ---------------------------------------------------------------------------
  it('INSERT continua passando (o ledger segue recebendo lancamento)', async () => {
    // `solicitante_matricula` entrou em 06/10/2026 pela migration 0075: o CHECK
    // `ck_estoque_mov_saida_solicitante` recusa saída sem ela, e sem este valor
    // o caso falharia aqui, antes de medir o que ele mede (que o INSERT segue
    // passando com o gatilho de append-only no lugar). Quem prova o CHECK em si
    // é tests/integration/estoque-movimentacoes-solicitante-postgres.test.ts.
    const novas = await sql<{ id: string }[]>`
      INSERT INTO estoque_movimentacoes
        (tipo, material_id, quantidade, local_origem, motivo, usuario_id,
         solicitante_matricula)
      VALUES
        ('saida', ${materialId}::uuid, 2, ${localId}::uuid, 'retirada',
         gen_random_uuid(), '482913')
      RETURNING id
    `;
    expect(novas).toHaveLength(1);

    const [total] = await sql<{ total: string }[]>`
      SELECT COUNT(*)::text AS total FROM estoque_movimentacoes
    `;
    expect(total!.total).toBe('2');
  });

  it('TRUNCATE continua possivel para o dono (limpeza das suites de integracao)', async () => {
    await sql`TRUNCATE estoque_movimentacoes CASCADE`;
    const [total] = await sql<{ total: string }[]>`
      SELECT COUNT(*)::text AS total FROM estoque_movimentacoes
    `;
    expect(total!.total).toBe('0');
  });

  // ---------------------------------------------------------------------------
  // Mudanca de comportamento que a 0074 provoca, e que o cabecalho dela anuncia.
  // ---------------------------------------------------------------------------
  it('apagar local referenciado passa a FALHAR em vez de apagar origem/destino do ledger', async () => {
    // local_origem e local_destino sao ON DELETE SET NULL: o DELETE do local
    // fazia um UPDATE implicito em linha JA GRAVADA da trilha. O produto nunca
    // chegava la (o repositorio recusa antes, com LocalEmUso), mas psql chegava.
    await expect(
      sql`DELETE FROM estoque_locais WHERE id = ${localId}::uuid`,
    ).rejects.toMatchObject({ message: expect.stringContaining('append-only') });

    const [mov] = await sql<{ local_destino: string | null }[]>`
      SELECT local_destino FROM estoque_movimentacoes WHERE id = ${movId}::uuid
    `;
    expect(mov!.local_destino).toBe(localId);
  });
});
