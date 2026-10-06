/**
 * Matrícula de quem SOLICITOU a saída, contra POSTGRES REAL (migration 0075).
 *
 * Por que este arquivo existe: a 0075 usa `ADD CONSTRAINT ... CHECK (...) NOT
 * VALID`, que é padrão NOVO nesta base (medido em 06/10/2026: zero usos de NOT
 * VALID em supabase/migrations/). O que distingue `NOT VALID` de constraint
 * comum não é a recusa do insert novo, que as duas fazem igual: é o passado
 * continuar existindo. Então a régua tem os DOIS lados, e sem o segundo ela não
 * mede o que foi escolhido.
 *
 * COMO CADA LADO É MEDIDO
 * -----------------------
 *   Lado 1 (vale para linha nova): saída sem matrícula é recusada, e a asserção
 *   nomeia a CONSTRAINT, não só o código. As duas constraints desta migration
 *   recusam com o MESMO 23514, e julgar pelo código deixaria passar a troca de
 *   uma pela outra. Em todo caso de recusa, a contagem da tabela prova que nada
 *   entrou.
 *
 *   Lado 2 (não varre o passado): dentro de uma transação DESFEITA, a constraint
 *   é removida, uma saída sem matrícula é semeada (o estado que existe hoje no
 *   banco do órgão) e a constraint volta com `NOT VALID`. O `ADD CONSTRAINT`
 *   passa e a linha semeada continua lá. O CONTROLE é o mesmo estado com a
 *   constraint SEM `NOT VALID`: ali o `ADD CONSTRAINT` FALHA. Sem o controle, o
 *   caso ficaria verde contra uma constraint comum numa tabela vazia.
 *
 * Por que transação desfeita, e não limpeza no fim: a 0074 tornou o ledger
 * append-only no banco, com gatilho que recusa DELETE inclusive para o dono.
 * Linha de saída sem matrícula semeada de verdade ficaria lá para sempre, e
 * quebraria as outras suítes.
 *
 * O `convalidated` sai do catálogo (`pg_constraint`), nunca do texto da
 * migration.
 *
 * Roda apenas com `TEST_DATABASE_URL` apontando para um Postgres descartável com
 * as migrations aplicadas; sem a variável, o arquivo é pulado. A bancada de
 * 06/10/2026 não tem Docker, psql nem pg_isready (decisão do Rafael de
 * 01/10/2026), então quem executa isto é o job `integracao` do CI: NÃO MEDIDO
 * localmente.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import postgres, { type Sql } from 'postgres';

const URL_TESTE = process.env.TEST_DATABASE_URL ?? '';
const rodar = URL_TESTE.length > 0 ? describe : describe.skip;

process.env.DATABASE_URL = URL_TESTE;

const TABELA = 'public.estoque_movimentacoes';
const CK_SAIDA = 'ck_estoque_mov_saida_solicitante';
const CK_FORMATO = 'ck_estoque_mov_matricula_formato';

rodar('estoque_movimentacoes, matricula do solicitante (0075)', () => {
  let sql: Sql;
  let localId: string;
  let materialId: string;
  let conferenciaId: string;

  beforeAll(async () => {
    sql = postgres(URL_TESTE, { max: 3, prepare: false });
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  beforeEach(async () => {
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
      VALUES ('Cabo coaxial', 'quantificavel')
      RETURNING id
    `;
    materialId = materiais[0]!.id;

    const conferencias = await sql<{ id: string }[]>`
      INSERT INTO estoque_conferencias (unidade, natureza, criada_por)
      VALUES ('PENHA', 'quantificavel', gen_random_uuid())
      RETURNING id
    `;
    conferenciaId = conferencias[0]!.id;
  });

  /** INSERT de saída com os campos que variam entre os casos. */
  function inserirSaida(matricula: string | null, conferencia: string | null = null) {
    return sql<{ id: string }[]>`
      INSERT INTO estoque_movimentacoes
        (tipo, material_id, quantidade, local_origem, motivo, usuario_id,
         conferencia_id, solicitante_matricula)
      VALUES
        ('saida', ${materialId}::uuid, 2, ${localId}::uuid, 'retirada',
         gen_random_uuid(), ${conferencia}, ${matricula})
      RETURNING id
    `;
  }

  async function totalDeLinhas(): Promise<string> {
    const [t] = await sql<{ total: string }[]>`
      SELECT COUNT(*)::text AS total FROM estoque_movimentacoes
    `;
    return t!.total;
  }

  // ---------------------------------------------------------------------------
  // Catálogo: o que a migration diz ter feito.
  // ---------------------------------------------------------------------------
  it('a coluna existe, é text e é nulável', async () => {
    const colunas = await sql<{ data_type: string; is_nullable: string }[]>`
      SELECT data_type, is_nullable
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'estoque_movimentacoes'
         AND column_name = 'solicitante_matricula'
    `;
    expect(colunas).toHaveLength(1);
    expect(colunas[0]!.data_type).toBe('text');
    // Nulável de propósito: entrada, transferência, baixa e ajuste não têm
    // solicitante. Quem exige na saída é o CHECK, e não a coluna.
    expect(colunas[0]!.is_nullable).toBe('YES');
  });

  it('as duas constraints existem como CHECK e estão NOT VALID no catálogo', async () => {
    const cs = await sql<{ conname: string; contype: string; convalidated: boolean }[]>`
      SELECT conname, contype::text AS contype, convalidated
        FROM pg_constraint
       WHERE conrelid = ${TABELA}::regclass
         AND conname IN (${CK_FORMATO}, ${CK_SAIDA})
       ORDER BY conname
    `;
    expect(cs.map((c) => c.conname)).toEqual([CK_FORMATO, CK_SAIDA]);
    expect(cs.map((c) => c.contype)).toEqual(['c', 'c']);
    // O `convalidated = false` sai DAQUI, e não do texto da migration. É este
    // valor que diz que o passado não foi varrido.
    expect(cs.map((c) => c.convalidated)).toEqual([false, false]);
  });

  // ---------------------------------------------------------------------------
  // Lado 1 do NOT VALID: linha NOVA obedece.
  // ---------------------------------------------------------------------------
  it('saída sem matrícula é recusada pela constraint de saída, e nada é gravado', async () => {
    await expect(inserirSaida(null)).rejects.toMatchObject({
      code: '23514',
      // Nomeia a CONSTRAINT: as duas desta migration recusam com 23514, e
      // julgar só pelo código deixaria passar a troca de uma pela outra.
      constraint_name: CK_SAIDA,
    });
    expect(await totalDeLinhas()).toBe('0');
  });

  it('saída COM matrícula é gravada (âncora de presença)', async () => {
    // Sem este caso, uma constraint que recusasse TODA saída deixaria o caso
    // acima verde.
    const linhas = await inserirSaida('SP-482913');
    expect(linhas).toHaveLength(1);
    const [gravada] = await sql<{ solicitante_matricula: string | null }[]>`
      SELECT solicitante_matricula FROM estoque_movimentacoes WHERE id = ${linhas[0]!.id}::uuid
    `;
    expect(gravada!.solicitante_matricula).toBe('SP-482913');
  });

  it('entrada sem matrícula continua passando (a regra é só da saída)', async () => {
    const linhas = await sql<{ id: string }[]>`
      INSERT INTO estoque_movimentacoes
        (tipo, material_id, quantidade, local_destino, motivo, usuario_id)
      VALUES
        ('entrada', ${materialId}::uuid, 5, ${localId}::uuid, 'carga inicial',
         gen_random_uuid())
      RETURNING id
    `;
    expect(linhas).toHaveLength(1);
  });

  it('saída de reconciliação de conferência passa sem matrícula (isenção semântica)', async () => {
    // A única isenção, e ela é semântica e não temporal: ninguém retirou
    // material, foi ajuste de inventário. Sem ela, a reconciliação de
    // divergência negativa da 0064 pararia de funcionar.
    const linhas = await inserirSaida(null, conferenciaId);
    expect(linhas).toHaveLength(1);
    const [gravada] = await sql<{ conferencia_id: string | null }[]>`
      SELECT conferencia_id FROM estoque_movimentacoes WHERE id = ${linhas[0]!.id}::uuid
    `;
    expect(gravada!.conferencia_id).toBe(conferenciaId);
  });

  // ---------------------------------------------------------------------------
  // Formato: identificador, não frase. A máscara real do órgão NÃO foi medida,
  // então o que se mede aqui é só o piso escrito na 0075.
  // ---------------------------------------------------------------------------
  it('nome digitado (com espaço) é recusado pela constraint de FORMATO', async () => {
    await expect(inserirSaida('Maria Antonia')).rejects.toMatchObject({
      code: '23514',
      // Constraint diferente da anterior, com o mesmo código: é exatamente por
      // isto que a asserção nomeia a camada.
      constraint_name: CK_FORMATO,
    });
    expect(await totalDeLinhas()).toBe('0');
  });

  it('cada caractere de espaço em branco é recusado, um por um', async () => {
    // `[:space:]` no Postgres cobre seis caracteres. Um caso por caractere,
    // porque teste com os seis juntos numa string ficaria verde se a classe
    // cobrisse só o primeiro.
    const brancos: ReadonlyArray<[string, string]> = [
      ['espaco', ' '],
      ['tab', '\t'],
      ['nova linha', '\n'],
      ['retorno de carro', '\r'],
      ['form feed', '\f'],
      ['tabulacao vertical', '\v'],
    ];
    for (const [nome, caractere] of brancos) {
      const valor = `48${caractere}2913`;
      await expect(inserirSaida(valor), nome).rejects.toMatchObject({
        code: '23514',
        constraint_name: CK_FORMATO,
      });
    }
    expect(brancos).toHaveLength(6);
    expect(await totalDeLinhas()).toBe('0');
  });

  it('as bordas de tamanho recusam fora e aceitam dentro', async () => {
    await expect(inserirSaida('7')).rejects.toMatchObject({ constraint_name: CK_FORMATO });
    await expect(inserirSaida('7'.repeat(31))).rejects.toMatchObject({
      constraint_name: CK_FORMATO,
    });
    expect(await totalDeLinhas()).toBe('0');

    // Os dois lados dentro do limite, senão a régua não separa "recusa fora" de
    // "recusa tudo".
    expect(await inserirSaida('7'.repeat(2))).toHaveLength(1);
    expect(await inserirSaida('7'.repeat(30))).toHaveLength(1);
    expect(await totalDeLinhas()).toBe('2');
  });

  it('o formato vale para tipo que não é saída (matrícula inválida em entrada)', async () => {
    await expect(
      sql`
        INSERT INTO estoque_movimentacoes
          (tipo, material_id, quantidade, local_destino, motivo, usuario_id,
           solicitante_matricula)
        VALUES
          ('entrada', ${materialId}::uuid, 5, ${localId}::uuid, 'carga',
           gen_random_uuid(), 'Maria Antonia')
        RETURNING id
      `,
    ).rejects.toMatchObject({ code: '23514', constraint_name: CK_FORMATO });
    expect(await totalDeLinhas()).toBe('0');
  });

  // ---------------------------------------------------------------------------
  // Lado 2 do NOT VALID: o passado continua existindo. É o caso que distingue
  // `NOT VALID` de constraint comum, e ele vem com o controle que DEVE falhar.
  // ---------------------------------------------------------------------------
  const CHECK_SAIDA_SQL = `
    CHECK (
      tipo <> 'saida'
      OR conferencia_id IS NOT NULL
      OR solicitante_matricula IS NOT NULL
    )`;

  it('linha semeada ANTES do ADD CONSTRAINT sobrevive a ele (transação desfeita)', async () => {
    const SENTINELA = 'desfazer-de-proposito';
    let semeadaId = '';
    let sobreviveu = '';
    let convalidated: boolean | null = null;

    await expect(
      sql.begin(async (tx) => {
        // Reproduz o estado real do banco do órgão em 06/10/2026: saída antiga,
        // sem solicitante, gravada antes de a regra existir. A mutação tem de
        // reproduzir o estado que a régua descreve, senão o `ADD CONSTRAINT`
        // passaria por não haver linha nenhuma para violar.
        await tx.unsafe(`ALTER TABLE estoque_movimentacoes DROP CONSTRAINT ${CK_SAIDA}`);
        const semeada = await tx<{ id: string }[]>`
          INSERT INTO estoque_movimentacoes
            (tipo, material_id, quantidade, local_origem, motivo, usuario_id)
          VALUES
            ('saida', ${materialId}::uuid, 2, ${localId}::uuid, 'retirada antiga',
             gen_random_uuid())
          RETURNING id
        `;
        semeadaId = semeada[0]!.id;

        await tx.unsafe(
          `ALTER TABLE estoque_movimentacoes ADD CONSTRAINT ${CK_SAIDA} ${CHECK_SAIDA_SQL} NOT VALID`,
        );

        const [depois] = await tx<{ total: string }[]>`
          SELECT COUNT(*)::text AS total FROM estoque_movimentacoes WHERE id = ${semeadaId}::uuid
        `;
        sobreviveu = depois!.total;

        const [c] = await tx<{ convalidated: boolean }[]>`
          SELECT convalidated FROM pg_constraint
           WHERE conrelid = ${TABELA}::regclass AND conname = ${CK_SAIDA}
        `;
        convalidated = c!.convalidated;

        throw new Error(SENTINELA);
      }),
    ).rejects.toThrow(SENTINELA);

    expect(semeadaId).not.toBe('');
    // O que `NOT VALID` compra: a regra passa a valer e a linha violadora fica.
    expect(sobreviveu).toBe('1');
    expect(convalidated).toBe(false);

    // A transação desfeita devolve a tabela ao estado de produção.
    const [estado] = await sql<{ total: string; convalidated: boolean }[]>`
      SELECT (SELECT COUNT(*)::text FROM estoque_movimentacoes) AS total,
             (SELECT convalidated FROM pg_constraint
               WHERE conrelid = ${TABELA}::regclass AND conname = ${CK_SAIDA}) AS convalidated
    `;
    expect(estado!.total).toBe('0');
    expect(estado!.convalidated).toBe(false);
  });

  it('CONTROLE: no MESMO estado, a constraint SEM NOT VALID falha ao ser criada', async () => {
    // Sem este caso o anterior não prova nada: constraint comum sobre tabela
    // sem linha violadora também passaria, e `NOT VALID` pareceria decorativo.
    const SENTINELA = 'desfazer-de-proposito';
    let erroDoControle: { code?: string; constraint_name?: string } | null = null;

    await expect(
      sql.begin(async (tx) => {
        await tx.unsafe(`ALTER TABLE estoque_movimentacoes DROP CONSTRAINT ${CK_SAIDA}`);
        await tx`
          INSERT INTO estoque_movimentacoes
            (tipo, material_id, quantidade, local_origem, motivo, usuario_id)
          VALUES
            ('saida', ${materialId}::uuid, 2, ${localId}::uuid, 'retirada antiga',
             gen_random_uuid())
        `;

        // Savepoint: o erro esperado aborta a transação inteira sem ele, e o
        // `throw` da sentinela nunca chegaria a ser a causa do rollback.
        try {
          await tx.savepoint(async (sp) => {
            await sp.unsafe(
              `ALTER TABLE estoque_movimentacoes ADD CONSTRAINT ${CK_SAIDA} ${CHECK_SAIDA_SQL}`,
            );
          });
        } catch (erro) {
          erroDoControle = erro as { code?: string; constraint_name?: string };
        }

        throw new Error(SENTINELA);
      }),
    ).rejects.toThrow(SENTINELA);

    // 23514 é check_violation: a validação varreu a tabela e achou a linha
    // antiga. A asserção nomeia a constraint, e não só o código.
    expect(erroDoControle).not.toBeNull();
    expect(erroDoControle!.code).toBe('23514');
    expect(erroDoControle!.constraint_name).toBe(CK_SAIDA);

    const [estado] = await sql<{ total: string; convalidated: boolean }[]>`
      SELECT (SELECT COUNT(*)::text FROM estoque_movimentacoes) AS total,
             (SELECT convalidated FROM pg_constraint
               WHERE conrelid = ${TABELA}::regclass AND conname = ${CK_SAIDA}) AS convalidated
    `;
    expect(estado!.total).toBe('0');
    expect(estado!.convalidated).toBe(false);
  });
});
