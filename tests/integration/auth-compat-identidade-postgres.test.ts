/**
 * O shim `db/auth-compat.sql` sustenta a consulta de identidade, contra POSTGRES
 * REAL.
 *
 * Defeito que este arquivo nasceu para reprovar (medido em 05/10/2026, em
 * producao hoje e nao efeito de trabalho nosso): `usuarios-identidade-repository`
 * le `u.raw_user_meta_data->>'nome'`, coluna que o GoTrue do Supabase tem, e o
 * stub de `auth.users` do shim NAO tinha (ele declarava exatamente id, email e
 * created_at; `raw_user_meta_data` aparecia uma unica vez em todo o SQL do
 * projeto, num COMENTARIO da 0020). No Postgres puro da entrega PRODESP a
 * consulta levantava 42703 undefined_column, e as duas superficies perdiam o
 * nome do operador: a trilha caia no ramo degradado (id cru) e o EXPORT de
 * movimentacoes nem degradava, subia FalhaRepositorio e virava 500.
 *
 * Esta regua se prova nos DOIS estados, e o estado vermelho e reproduzivel sem
 * desfazer o conserto: o caso do catalogo reprova em qualquer banco cujo
 * auth.users nao tenha a coluna (o que era o CI inteiro antes do conserto), e o
 * caso de leitura abaixo reproduz o estado contrario, com a coluna preenchida.
 *
 * O cuidado que decide o valor dos casos: "a coluna existe" nao e a propriedade
 * que o produto usa. Por isso o terceiro caso roda a MESMA consulta do
 * repositorio (`raw_user_meta_data->>'nome'`) e afirma o VALOR, com os dois
 * lados: objeto vazio resolve nome NULO (degradacao por desenho, que faz o
 * codigo cair no e-mail) e objeto preenchido resolve o nome.
 *
 * Roda apenas com `TEST_DATABASE_URL` apontando para um Postgres descartavel com
 * o shim e as migrations aplicados; sem a variavel, o arquivo e pulado.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import postgres, { type Sql } from 'postgres';

const URL_TESTE = process.env.TEST_DATABASE_URL ?? '';
const rodar = URL_TESTE.length > 0 ? describe : describe.skip;

process.env.DATABASE_URL = URL_TESTE;

// Dominio reservado: nunca endereco real, nem o pessoal do dono da operacao.
const EMAIL_SEM_NOME = 'identidade-sem-nome@exemplo-dmo.test';
const EMAIL_COM_NOME = 'identidade-com-nome@exemplo-dmo.test';

rodar('db/auth-compat.sql sustenta a consulta de identidade', () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = postgres(URL_TESTE, { max: 3, prepare: false });
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  afterEach(async () => {
    // Limpa so o que este arquivo cria: auth.users e compartilhada com a
    // semeadura do job e com outras suites, entao TRUNCATE aqui seria dano
    // colateral.
    await sql`DELETE FROM auth.users WHERE email IN (${EMAIL_SEM_NOME}, ${EMAIL_COM_NOME})`;
  });

  it('auth.users tem a coluna raw_user_meta_data, jsonb, NOT NULL e com default', async () => {
    const colunas = await sql<
      { data_type: string; is_nullable: string; column_default: string | null }[]
    >`
      SELECT data_type, is_nullable, column_default
        FROM information_schema.columns
       WHERE table_schema = 'auth'
         AND table_name = 'users'
         AND column_name = 'raw_user_meta_data'
    `;
    // Existencia primeiro: assercao de FORMA sobre coluna ausente leria undefined
    // e passaria por acidente.
    expect(colunas).toHaveLength(1);
    expect(colunas[0]!.data_type).toBe('jsonb');
    // NOT NULL com default existe para `->>'nome'` nunca ver NULL no objeto
    // inteiro, e para linha JA GRAVADA em auth.users nao ficar sem o campo.
    expect(colunas[0]!.is_nullable).toBe('NO');
    expect(colunas[0]!.column_default).toContain('{}');
  });

  it('o stub continua tendo id, email e created_at (o conserto nao trocou o contrato)', async () => {
    const colunas = await sql<{ column_name: string }[]>`
      SELECT column_name
        FROM information_schema.columns
       WHERE table_schema = 'auth' AND table_name = 'users'
       ORDER BY column_name
    `;
    const nomes = colunas.map((c) => c.column_name);
    // Ancora de PRESENCA: sem ela, uma tabela auth.users apagada deixaria o caso
    // acima vermelho e este verde, e ninguem saberia qual dos dois mundos e o
    // real. `toContain` e nao igualdade de lista porque no Supabase gerenciado a
    // tabela tem dezenas de colunas do GoTrue, e este arquivo tambem roda la o
    // dia em que a identidade definitiva chegar.
    expect(nomes).toContain('id');
    expect(nomes).toContain('email');
    expect(nomes).toContain('created_at');
    expect(nomes).toContain('raw_user_meta_data');
  });

  it('a MESMA consulta do repositorio de identidade nao estoura e resolve os dois lados', async () => {
    const [semNome] = await sql<{ id: string }[]>`
      INSERT INTO auth.users (email) VALUES (${EMAIL_SEM_NOME}) RETURNING id::text AS id
    `;
    const [comNome] = await sql<{ id: string }[]>`
      INSERT INTO auth.users (email, raw_user_meta_data)
      VALUES (${EMAIL_COM_NOME}, ${sql.json({ nome: 'Maria Antônia Gonçalves' })})
      RETURNING id::text AS id
    `;

    // Copia fiel do SELECT de usuarios-identidade-repository.pg.ts. Se aquele
    // arquivo mudar de coluna, este caso continua verde medindo outra coisa, e
    // quem denuncia e a catraca estatica de
    // tests/unit/infrastructure/db/auth-compat-identidade-regression.test.ts,
    // que confere que o repositorio e o shim falam da MESMA coluna.
    const linhas = await sql<{ id: string; email: string | null; nome: string | null }[]>`
      SELECT u.id::text                   AS id,
             u.email                       AS email,
             u.raw_user_meta_data->>'nome' AS nome
        FROM auth.users u
       WHERE u.id = ANY(${[semNome!.id, comNome!.id]}::uuid[])
    `;
    expect(linhas).toHaveLength(2);

    const porId = new Map(linhas.map((l) => [l.id, l]));
    // Lado degradado POR DESENHO: objeto vazio resolve nome nulo, e e por isso
    // que `rotuloOperador` cai para o e-mail. Nulo aqui nao e falha.
    expect(porId.get(semNome!.id)!.nome).toBeNull();
    expect(porId.get(semNome!.id)!.email).toBe(EMAIL_SEM_NOME);
    // Lado preenchido: o acento tem de voltar byte a byte, porque o nome vai
    // para a coluna Operador da planilha e para a trilha.
    expect(porId.get(comNome!.id)!.nome).toBe('Maria Antônia Gonçalves');
  });

  it('o default se aplica a linha inserida sem o campo (nunca NULL no objeto)', async () => {
    const [u] = await sql<{ meta: unknown; tipo: string }[]>`
      INSERT INTO auth.users (email) VALUES (${EMAIL_SEM_NOME})
      RETURNING raw_user_meta_data AS meta,
                pg_typeof(raw_user_meta_data)::text AS tipo
    `;
    expect(u!.tipo).toBe('jsonb');
    expect(u!.meta).toEqual({});
  });
});
