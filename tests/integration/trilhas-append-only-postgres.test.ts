/**
 * Append-only das QUATRO trilhas de auditoria contra POSTGRES REAL (0076).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Ate 06/10/2026 `acesso_ficha`, `triagem_eventos`, `ana_revisao_evento` e
 * `postos_evento` eram chamadas de append-only no COMMENT e no cabecalho das
 * migrations, e o que sustentava a afirmacao era uma linha de
 * `REVOKE UPDATE, DELETE ... FROM PUBLIC`. Privilegio nao media o acesso do DONO
 * da tabela, e a aplicacao conecta como dono (ADR-0024, janela da PRODESP):
 * nenhuma das quatro tinha gatilho. Em `acesso_ficha` nem o REVOKE existia (na
 * 0005 ele esta dentro de um bloco de comentario), e a 0025 citava `acesso_ficha`
 * como "mesmo padrao" ao justificar o proprio REVOKE. A 0076 poe a segunda
 * camada; este arquivo mede o EFEITO dela, e e o unico lugar onde isso e medido,
 * porque nesta bancada nao ha Docker nem PostgreSQL (decisao do proprietario de
 * 01/10/2026): quem roda e o job `integracao` do CI.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O CUIDADO QUE DECIDE O VALOR DESTA REGUA
 * ─────────────────────────────────────────────────────────────────────────────
 * Ela NAO julga a recusa pelo codigo de erro. Aqui ha duas camadas que podem
 * recusar a mesma escrita, e a 0076 escolheu `check_violation` (23514) para o
 * gatilho justamente porque o privilegio produz `insufficient_privilege`
 * (42501): regua que olha o codigo cega quando a segunda camada aparece. Cada
 * caso nomeia a camada por TRES coisas:
 *
 *   1. o privilegio de UPDATE/DELETE CONTINUA valendo para esta conexao
 *      (`has_table_privilege` true, porque ela e o dono), logo nao foi a camada 1;
 *   2. a mensagem traz o sentinela `trilha-append-only:<tabela>`, que nenhuma
 *      outra camada produz (privilegio diz "permission denied for table", FK diz
 *      "violates foreign key constraint", CHECK diz o nome da constraint);
 *   3. o controle causal: com o gatilho desligado dentro de uma transacao
 *      desfeita, o MESMO UPDATE afeta 1 linha.
 *
 * E cada caso INSERE a linha antes de tentar alterar: o gatilho e FOR EACH ROW,
 * entao UPDATE que casa ZERO linha nao dispara nada e sairia verde sem medir a
 * guarda.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * O MUTANTE, por tabela
 * ─────────────────────────────────────────────────────────────────────────────
 * Comentar o par da tabela na lista de `CREATE TRIGGER` da secao C da 0076 (ou
 * rodar `DROP TRIGGER <gatilho> ON <tabela>` no banco de teste) tem de reprovar,
 * por tabela, estes casos e por ESTAS assercoes:
 *
 *   - "o gatilho da 0076 existe e esta habilitado": a tabela nao aparece no
 *     catalogo;
 *   - "UPDATE em linha existente e recusado": o UPDATE passa, `rejects` falha;
 *   - "DELETE de linha existente e recusado": idem;
 *   - "quem recusa e o GATILHO": falha no `DISABLE TRIGGER` de gatilho
 *     inexistente, o que e reprovacao por ERRO e nao pela assercao, e por isso
 *     nao conta como mutante morto: quem conta sao os tres de cima.
 *
 * Mutante NAO EXECUTADO contra banco de pe nesta bancada (sem Docker, sem
 * psql). O par de estados e para rodar no job `integracao`.
 *
 * Roda apenas com `TEST_DATABASE_URL` apontando para um Postgres descartavel
 * com as migrations aplicadas; sem a variavel, o arquivo e pulado e nunca toca
 * producao.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import postgres, { type Sql, type TransactionSql } from 'postgres';
import {
  APPEND_ONLY_DE_OUTRA_MIGRATION,
  comGatilhoDesligado,
  EXCLUIDAS_DO_APPEND_ONLY,
  TRILHAS_APPEND_ONLY,
  type TrilhaAppendOnly,
} from '../apoio/trilha-append-only';

const URL_TESTE = process.env.TEST_DATABASE_URL ?? '';
const rodar = URL_TESTE.length > 0 ? describe : describe.skip;

process.env.DATABASE_URL = URL_TESTE;

/** Marca propria deste arquivo, para a limpeza nao alcancar dado de ninguem. */
const MARCA = 'ZZ-TESTE-APPEND-ONLY';
const TECNICO = '7c7c7c7c-1111-4111-8111-111111111111';
/** Ator das trilhas, criado para ser APAGADO em um dos casos. */
const ATOR = '7c7c7c7c-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const POSTO = '7c7c7c7c-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const IP = '203.0.113.7';
const AGENTE = 'vitest';

type Consulta = Sql | TransactionSql;

type Caso = {
  tabela: TrilhaAppendOnly;
  /** Coluna que o caso tenta adulterar. NUNCA `ip` nem `user_agent`: aquelas
   *  tem excecao de LGPD e passariam, medindo a excecao em vez da guarda. */
  campo: string;
  valorOriginal: string;
  valorAdulterado: string;
  semear: (q: Consulta, diasAtras?: number) => Promise<string>;
  adulterar: (q: Consulta, id: string) => Promise<{ count: number }>;
  apagar: (q: Consulta, id: string) => Promise<{ count: number }>;
  lerCampo: (q: Consulta, id: string) => Promise<string | null>;
  /** O UPDATE que a 0048 faz: ip e user_agent para NULL. Deve PASSAR. */
  anonimizar: (q: Consulta, id: string) => Promise<{ count: number }>;
  /** Escrever um ip NOVO. Deve ser RECUSADO (a excecao e de mao unica). */
  forjarIp: (q: Consulta, id: string) => Promise<{ count: number }>;
  /**
   * Le `ip` e `user_agent` da linha. O `ip` sai SEM mascara, por `host(ip)`.
   *
   * Medido no run do CI de 06/10/2026: a coluna e `INET` em `triagem_eventos`,
   * `ana_revisao_evento` e `postos_evento` (0025, 0029, 0031) e `TEXT` em
   * `acesso_ficha` (0005). Com `ip::text` o Postgres devolve a representacao do
   * tipo, `203.0.113.7/32`, e estes seis casos reprovavam por REPRESENTACAO
   * com a guarda do produto funcionando: a recusa do gatilho passava, e quem
   * falhava era a assercao seguinte, de que o ip nao mudou.
   *
   * `host()` nao cega o defeito que o caso procura: endereco de REDE gravado no
   * lugar do host (`203.0.113.0/24`) sai como `203.0.113.0` e continua
   * diferente do semeado.
   */
  lerPii: (q: Consulta, id: string) => Promise<{ ip: string | null; user_agent: string | null }>;
  contar: (q: Consulta, id: string) => Promise<number>;
};

/** Preenchidos no `beforeAll`: as trilhas precisam de linha-mae para apontar. */
let fichaId = '';
let estacaoId = '';
let loteId = '';

async function idDe(consulta: Promise<{ id: string }[]>): Promise<string> {
  const linhas = await consulta;
  return linhas[0]!.id;
}

async function contarPorId(q: Consulta, tabela: TrilhaAppendOnly, id: string): Promise<number> {
  // `tabela` vem do mapa do apoio, nunca de parametro livre.
  const [linha] = await q.unsafe<{ total: string }[]>(
    `SELECT COUNT(*)::text AS total FROM ${tabela} WHERE id = $1::uuid`,
    [id],
  );
  return Number(linha!.total);
}

const CASOS: Caso[] = [
  {
    tabela: 'acesso_ficha',
    campo: 'acao',
    valorOriginal: 'visualizou_ficha',
    valorAdulterado: 'listou_arquivos',
    semear: (q, diasAtras = 0) =>
      idDe(
        q<{ id: string }[]>`
          INSERT INTO acesso_ficha (usuario_id, prefixo, acao, ip, user_agent, ocorreu_em)
          VALUES (${ATOR}, ${MARCA}, 'visualizou_ficha', ${IP}, ${AGENTE},
                  NOW() - make_interval(days => ${diasAtras}))
          RETURNING id`,
      ),
    adulterar: (q, id) =>
      q`UPDATE acesso_ficha SET acao = 'listou_arquivos' WHERE id = ${id}::uuid`,
    apagar: (q, id) => q`DELETE FROM acesso_ficha WHERE id = ${id}::uuid`,
    lerCampo: async (q, id) => {
      const [l] = await q<{ v: string | null }[]>`
        SELECT acao AS v FROM acesso_ficha WHERE id = ${id}::uuid`;
      return l?.v ?? null;
    },
    anonimizar: (q, id) =>
      q`UPDATE acesso_ficha SET ip = NULL, user_agent = NULL WHERE id = ${id}::uuid`,
    forjarIp: (q, id) =>
      q`UPDATE acesso_ficha SET ip = '198.51.100.9' WHERE id = ${id}::uuid`,
    lerPii: async (q, id) => {
      const [l] = await q<{ ip: string | null; user_agent: string | null }[]>`
        -- Unica das quatro em que a coluna ip e TEXT (0005), sem host().
        SELECT ip::text AS ip, user_agent FROM acesso_ficha WHERE id = ${id}::uuid`;
      return l!;
    },
    contar: (q, id) => contarPorId(q, 'acesso_ficha', id),
  },
  {
    tabela: 'triagem_eventos',
    campo: 'motivo',
    valorOriginal: 'motivo original do evento',
    valorAdulterado: 'motivo adulterado',
    semear: (q, diasAtras = 0) =>
      idDe(
        q<{ id: string }[]>`
          INSERT INTO triagem_eventos
            (triagem_id, evento, ator_id, motivo, ip, user_agent, ocorreu_em)
          VALUES (${fichaId}::uuid, 'submetida', ${ATOR}::uuid,
                  'motivo original do evento', ${IP}::inet, ${AGENTE},
                  NOW() - make_interval(days => ${diasAtras}))
          RETURNING id`,
      ),
    adulterar: (q, id) =>
      q`UPDATE triagem_eventos SET motivo = 'motivo adulterado' WHERE id = ${id}::uuid`,
    apagar: (q, id) => q`DELETE FROM triagem_eventos WHERE id = ${id}::uuid`,
    lerCampo: async (q, id) => {
      const [l] = await q<{ v: string | null }[]>`
        SELECT motivo AS v FROM triagem_eventos WHERE id = ${id}::uuid`;
      return l?.v ?? null;
    },
    anonimizar: (q, id) =>
      q`UPDATE triagem_eventos SET ip = NULL, user_agent = NULL WHERE id = ${id}::uuid`,
    forjarIp: (q, id) =>
      q`UPDATE triagem_eventos SET ip = '198.51.100.9'::inet WHERE id = ${id}::uuid`,
    lerPii: async (q, id) => {
      const [l] = await q<{ ip: string | null; user_agent: string | null }[]>`
        SELECT host(ip) AS ip, user_agent FROM triagem_eventos WHERE id = ${id}::uuid`;
      return l!;
    },
    contar: (q, id) => contarPorId(q, 'triagem_eventos', id),
  },
  {
    tabela: 'ana_revisao_evento',
    campo: 'observacao',
    valorOriginal: 'observacao original do evento',
    valorAdulterado: 'observacao adulterada',
    semear: (q, diasAtras = 0) =>
      idDe(
        q<{ id: string }[]>`
          INSERT INTO ana_revisao_evento
            (estacao_id, evento, ator_id, observacao, ip, user_agent, ocorreu_em)
          VALUES (${estacaoId}::uuid, 'revisada', ${ATOR}::uuid,
                  'observacao original do evento', ${IP}::inet, ${AGENTE},
                  NOW() - make_interval(days => ${diasAtras}))
          RETURNING id`,
      ),
    adulterar: (q, id) =>
      q`UPDATE ana_revisao_evento SET observacao = 'observacao adulterada' WHERE id = ${id}::uuid`,
    apagar: (q, id) => q`DELETE FROM ana_revisao_evento WHERE id = ${id}::uuid`,
    lerCampo: async (q, id) => {
      const [l] = await q<{ v: string | null }[]>`
        SELECT observacao AS v FROM ana_revisao_evento WHERE id = ${id}::uuid`;
      return l?.v ?? null;
    },
    anonimizar: (q, id) =>
      q`UPDATE ana_revisao_evento SET ip = NULL, user_agent = NULL WHERE id = ${id}::uuid`,
    forjarIp: (q, id) =>
      q`UPDATE ana_revisao_evento SET ip = '198.51.100.9'::inet WHERE id = ${id}::uuid`,
    lerPii: async (q, id) => {
      const [l] = await q<{ ip: string | null; user_agent: string | null }[]>`
        SELECT host(ip) AS ip, user_agent FROM ana_revisao_evento WHERE id = ${id}::uuid`;
      return l!;
    },
    contar: (q, id) => contarPorId(q, 'ana_revisao_evento', id),
  },
  {
    tabela: 'postos_evento',
    campo: 'observacao',
    valorOriginal: 'observacao original do evento',
    valorAdulterado: 'observacao adulterada',
    semear: (q, diasAtras = 0) =>
      idDe(
        q<{ id: string }[]>`
          INSERT INTO postos_evento
            (posto_id, evento, ator_id, observacao, ip, user_agent, ocorreu_em)
          VALUES (${POSTO}::uuid, 'criado', ${ATOR}::uuid,
                  'observacao original do evento', ${IP}::inet, ${AGENTE},
                  NOW() - make_interval(days => ${diasAtras}))
          RETURNING id`,
      ),
    adulterar: (q, id) =>
      q`UPDATE postos_evento SET observacao = 'observacao adulterada' WHERE id = ${id}::uuid`,
    apagar: (q, id) => q`DELETE FROM postos_evento WHERE id = ${id}::uuid`,
    lerCampo: async (q, id) => {
      const [l] = await q<{ v: string | null }[]>`
        SELECT observacao AS v FROM postos_evento WHERE id = ${id}::uuid`;
      return l?.v ?? null;
    },
    anonimizar: (q, id) =>
      q`UPDATE postos_evento SET ip = NULL, user_agent = NULL WHERE id = ${id}::uuid`,
    forjarIp: (q, id) =>
      q`UPDATE postos_evento SET ip = '198.51.100.9'::inet WHERE id = ${id}::uuid`,
    lerPii: async (q, id) => {
      const [l] = await q<{ ip: string | null; user_agent: string | null }[]>`
        SELECT host(ip) AS ip, user_agent FROM postos_evento WHERE id = ${id}::uuid`;
      return l!;
    },
    contar: (q, id) => contarPorId(q, 'postos_evento', id),
  },
];

rodar('as quatro trilhas de auditoria sao append-only no banco (0076)', () => {
  let sql: Sql;

  beforeAll(async () => {
    sql = postgres(URL_TESTE, { max: 3, prepare: false });

    await sql`
      INSERT INTO auth.users (id, email) VALUES
        (${TECNICO}::uuid, 'tecnico.appendonly@exemplo-nx.test'),
        (${ATOR}::uuid, 'ator.appendonly@exemplo-nx.test')
      ON CONFLICT (id) DO NOTHING`;

    await limpar();

    // `fichas_triagem.prefixo` deixou de ter FK para `postos` na 0069, entao a
    // marca propria serve de prefixo sem precisar criar posto.
    fichaId = await idDe(
      sql<{ id: string }[]>`
        INSERT INTO fichas_triagem
          (prefixo, cod_tipo_documento, data_visita, tecnico_id, tecnico_nome)
        VALUES (${MARCA}, 1, '2026-05-08', ${TECNICO}::uuid, 'Tecnico de teste')
        RETURNING id`,
    );
    loteId = await idDe(
      sql<{ id: string }[]>`INSERT INTO ana_revisao_lote (nome) VALUES (${MARCA}) RETURNING id`,
    );
    estacaoId = await idDe(
      sql<{ id: string }[]>`
        INSERT INTO ana_revisao_estacao (lote_id, codigo_ana)
        VALUES (${loteId}::uuid, 'ZZAPPEND1') RETURNING id`,
    );
  });

  afterEach(async () => {
    await limparTrilhas();
  });

  afterAll(async () => {
    await limpar();
    await sql`DELETE FROM auth.users WHERE id IN (${TECNICO}::uuid, ${ATOR}::uuid)`;
    await sql.end({ timeout: 5 });
  });

  /**
   * Limpeza das trilhas com o gatilho desligado DENTRO de transacao, que e o
   * unico jeito legitimo (ver tests/apoio/trilha-append-only.ts). TRUNCATE
   * passaria pelo gatilho e apagaria massa das outras suites.
   */
  async function limparTrilhas() {
    await comGatilhoDesligado(sql, 'acesso_ficha', (tx) =>
      tx`DELETE FROM acesso_ficha WHERE prefixo = ${MARCA}`.then(() => undefined));
    await comGatilhoDesligado(sql, 'triagem_eventos', (tx) =>
      tx`DELETE FROM triagem_eventos WHERE triagem_id IN (
           SELECT id FROM fichas_triagem WHERE prefixo = ${MARCA})`.then(() => undefined));
    await comGatilhoDesligado(sql, 'ana_revisao_evento', (tx) =>
      tx`DELETE FROM ana_revisao_evento WHERE estacao_id IN (
           SELECT e.id FROM ana_revisao_estacao e
             JOIN ana_revisao_lote l ON l.id = e.lote_id
            WHERE l.nome = ${MARCA})`.then(() => undefined));
    await comGatilhoDesligado(sql, 'postos_evento', (tx) =>
      tx`DELETE FROM postos_evento WHERE posto_id = ${POSTO}::uuid`.then(() => undefined));
  }

  async function limpar() {
    await limparTrilhas();
    await sql`DELETE FROM triagem_locks WHERE triagem_id IN (
      SELECT id FROM fichas_triagem WHERE prefixo = ${MARCA})`;
    await sql`DELETE FROM fichas_triagem WHERE prefixo = ${MARCA}`;
    // Depois da 0076 a estacao NAO cascateia mais para ana_revisao_evento, por
    // isso a trilha e apagada antes, acima.
    await sql`DELETE FROM ana_revisao_estacao WHERE lote_id IN (
      SELECT id FROM ana_revisao_lote WHERE nome = ${MARCA})`;
    await sql`DELETE FROM ana_revisao_lote WHERE nome = ${MARCA}`;
  }

  // ---------------------------------------------------------------------------
  // A. O estado que as assercoes de recusa interpretam.
  // ---------------------------------------------------------------------------
  it('a conexao do teste e o papel DONO das quatro tabelas, como a aplicacao conecta', async () => {
    const linhas = await sql<{ tabela: string; conectado: string; dono: string }[]>`
      SELECT c.relname AS tabela, current_user AS conectado,
             pg_get_userbyid(c.relowner) AS dono
        FROM pg_class c
       WHERE c.relname = ANY (${Object.keys(TRILHAS_APPEND_ONLY)}::text[])
         AND c.relnamespace = 'public'::regnamespace
       ORDER BY c.relname`;
    // Esta assercao se INVERTE no dia em que existir papel de aplicacao separado
    // do dono (hoje nao existe: db/auth-compat.sql so cria anon, authenticated e
    // service_role, os tres NOLOGIN). Quando inverter, a camada que recusa passa
    // a ser o privilegio, e os casos de recusa precisam ser revistos, nao
    // apagados.
    expect(linhas).toHaveLength(4);
    expect(linhas.filter((l) => l.conectado !== l.dono).map((l) => l.tabela)).toEqual([]);
  });

  it('nenhuma concessao DIRETA de UPDATE ou DELETE fora do dono', async () => {
    const concessoes = await sql<{ tabela: string; papel: string; privilegio: string }[]>`
      SELECT c.relname AS tabela,
             CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END AS papel,
             a.privilege_type AS privilegio
        FROM pg_class c
        CROSS JOIN LATERAL aclexplode(c.relacl) AS a
       WHERE c.relname = ANY (${Object.keys(TRILHAS_APPEND_ONLY)}::text[])
         AND c.relnamespace = 'public'::regnamespace
         AND a.privilege_type IN ('UPDATE', 'DELETE')
         AND a.grantee <> c.relowner`;
    // Projecao, e nao o resultado cru: o Result do postgres.js e um Array com
    // propriedades proprias (count, command, columns), e `toEqual([])` sobre ele
    // reprovaria por elas. Mapear tambem poe o infrator na mensagem de falha.
    expect(concessoes.map((c) => `${c.tabela} ${c.papel}:${c.privilegio}`)).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // B. O criterio, conferido pela maquina, e a catraca de completude.
  // ---------------------------------------------------------------------------
  it('as quatro cobertas registram FATO JA OCORRIDO: tem ocorreu_em e nao tem atualizado_em nem estado', async () => {
    // Este e o criterio da 0076 em forma de consulta. Tabela nova que entrar no
    // mapa sem ter a forma de trilha reprova aqui, antes de alguem descobrir em
    // producao que o produto precisava atualizar a linha.
    const colunas = await sql<{ tabela: string; coluna: string }[]>`
      SELECT table_name AS tabela, column_name AS coluna
        FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = ANY (${Object.keys(TRILHAS_APPEND_ONLY)}::text[])`;
    const porTabela = new Map<string, string[]>();
    for (const c of colunas) {
      porTabela.set(c.tabela, [...(porTabela.get(c.tabela) ?? []), c.coluna]);
    }
    const semOcorreuEm: string[] = [];
    const comEstadoMutavel: string[] = [];
    for (const tabela of Object.keys(TRILHAS_APPEND_ONLY)) {
      const cols = porTabela.get(tabela) ?? [];
      if (!cols.includes('ocorreu_em')) semOcorreuEm.push(tabela);
      for (const proibida of ['atualizado_em', 'atualizada_em', 'estado']) {
        if (cols.includes(proibida)) comEstadoMutavel.push(`${tabela}.${proibida}`);
      }
    }
    expect(semOcorreuEm, `sem ocorreu_em: ${semOcorreuEm.join(', ')}`).toEqual([]);
    expect(comEstadoMutavel, `com coluna de estado: ${comEstadoMutavel.join(', ')}`).toEqual([]);
  });

  // A catraca de completude (toda tabela com REVOKE tem decisao escrita) NAO
  // mora aqui: ela le as migrations do disco, nao precisa de banco, e por isso
  // vive em tests/unit/infrastructure/db/migration-0076-trilhas-append-only.test.ts,
  // que roda em TODO run do CI e nao so no job que sobe Postgres. Duas reguas
  // sobre o mesmo teto reprovam por sorte: aqui ficam as que exigem catalogo.

  it('as EXCLUIDAS continuam SEM gatilho de append-only', async () => {
    // Se alguem "estender a protecao" a elas por simetria, o produto quebra em
    // upsert de papel, decisao de triagem, liberacao de lock e retencao de
    // heartbeat. Esta assercao se INVERTE se algum dia uma delas deixar de ser
    // mutavel; nao se apaga.
    const gatilhos = await sql<{ tabela: string; tgname: string }[]>`
      SELECT c.relname AS tabela, t.tgname
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
       WHERE NOT t.tgisinternal
         AND c.relname = ANY (${[...EXCLUIDAS_DO_APPEND_ONLY.keys()]}::text[])
         AND t.tgname LIKE '%append_only%'`;
    expect(gatilhos.map((g) => `${g.tabela}:${g.tgname}`)).toEqual([]);
  });

  it('toda entrada das listas de decisao ainda existe como tabela no banco', async () => {
    // Entrada obsoleta na lista vira porta dos fundos: cobriria uma tabela
    // futura de mesmo nome que ninguem decidiu tolerar.
    const nomes = [...EXCLUIDAS_DO_APPEND_ONLY.keys(), ...APPEND_ONLY_DE_OUTRA_MIGRATION.keys()];
    const existentes = await sql<{ relname: string }[]>`
      SELECT relname FROM pg_class
       WHERE relname = ANY (${nomes}::text[])
         AND relnamespace = 'public'::regnamespace
         AND relkind = 'r'`;
    const vivas = new Set(existentes.map((e) => e.relname));
    const orfas = nomes.filter((n) => !vivas.has(n));
    expect(orfas, `entradas que nao existem mais: ${orfas.join(', ')}`).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // C. O catalogo: gatilho no lugar, e nenhuma FK escrevendo na trilha.
  // ---------------------------------------------------------------------------
  it('o gatilho da 0076 existe e esta habilitado nas quatro tabelas', async () => {
    const gatilhos = await sql<{ tabela: string; tgname: string; tgenabled: string }[]>`
      SELECT c.relname AS tabela, t.tgname, t.tgenabled
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
       WHERE NOT t.tgisinternal
         AND c.relname = ANY (${Object.keys(TRILHAS_APPEND_ONLY)}::text[])
         AND c.relnamespace = 'public'::regnamespace`;
    const vistos = new Map(gatilhos.map((g) => [`${g.tabela}:${g.tgname}`, g.tgenabled]));
    const faltando: string[] = [];
    const desligados: string[] = [];
    for (const [tabela, gatilho] of Object.entries(TRILHAS_APPEND_ONLY)) {
      const chave = `${tabela}:${gatilho}`;
      if (!vistos.has(chave)) faltando.push(chave);
      // 'O' = origin, habilitado. 'D' = disabled, e e o que sobra se alguma
      // limpeza de suite esquecer o ENABLE (ver tests/apoio).
      else if (vistos.get(chave) !== 'O') desligados.push(`${chave}=${vistos.get(chave)}`);
    }
    expect(faltando, `gatilho ausente: ${faltando.join(', ')}`).toEqual([]);
    expect(desligados, `gatilho desabilitado: ${desligados.join(', ')}`).toEqual([]);
  });

  it('nenhuma FK saindo das trilhas tem acao referencial que ESCREVE na trilha', async () => {
    // Regua de catalogo, pela ACAO e nao pelo nome: CASCADE ('c'), SET NULL
    // ('n') e SET DEFAULT ('d') fazem o banco apagar ou reescrever linha JA
    // GRAVADA quando a outra ponta sai, e disparam gatilho de linha. Era por aqui
    // que apagar um usuario no painel apagava a autoria de todos os eventos
    // dele, e que reimportar a planilha da ANA apagava a trilha da rodada
    // anterior. NO ACTION e RESTRICT nao escrevem e sao aceitos (e o caso de
    // triagem_eventos.triagem_id).
    const escritoras = await sql<{ alvo: string; conname: string; del: string; upd: string }[]>`
      SELECT (c.conrelid::regclass)::text || '.' ||
             (SELECT a.attname FROM pg_attribute a
               WHERE a.attrelid = c.conrelid AND a.attnum = c.conkey[1]) AS alvo,
             c.conname, c.confdeltype AS del, c.confupdtype AS upd
        FROM pg_constraint c
       WHERE c.contype = 'f'
         AND c.conrelid = ANY (${Object.keys(TRILHAS_APPEND_ONLY)}::text[]::regclass[])
         AND (c.confdeltype IN ('c', 'n', 'd') OR c.confupdtype IN ('c', 'n', 'd'))
       ORDER BY alvo`;
    expect(
      escritoras.map((e) => `${e.alvo} (${e.conname} del=${e.del} upd=${e.upd})`),
      'FK com acao que escreve na trilha',
    ).toEqual([]);
  });

  it('a regua de FK ENXERGA uma acao de escrita: prova por sonda em transacao desfeita', async () => {
    // Guarda da guarda: se `confdeltype`/`contype` mudarem de nome ou a consulta
    // parar de enxergar, ela devolveria vazio e declararia conformidade por
    // vacuidade. Aqui a sonda troca a FK RESTRICT de `triagem_eventos.triagem_id`
    // por SET NULL dentro de uma transacao DESFEITA, e a consulta tem de nomear.
    // A sonda ACRESCENTA uma FK (o PostgreSQL aceita mais de uma sobre a mesma
    // coluna) em vez de alterar a que existe: se o rollback falhasse, o resto
    // da suite continuaria contra o schema real, e o unico residuo possivel
    // seria uma constraint nomeada com `sonda_`, que o caso de catalogo acima
    // denunciaria em vez de esconder. `ON UPDATE CASCADE` e usado porque
    // `ON DELETE SET NULL` sobre coluna NOT NULL dependeria do momento em que o
    // banco valida a combinacao, e a sonda nao pode depender disso.
    const SONDA = 'sonda_fk_escritora_triagem_eventos';
    class Rollback extends Error {}
    let vistas: string[] = [];
    await sql
      .begin(async (tx) => {
        await tx.unsafe(
          `ALTER TABLE triagem_eventos ADD CONSTRAINT ${SONDA}
             FOREIGN KEY (triagem_id) REFERENCES fichas_triagem (id) ON UPDATE CASCADE`,
        );
        const linhas = await tx<{ conname: string }[]>`
          SELECT c.conname
            FROM pg_constraint c
           WHERE c.contype = 'f'
             AND c.conrelid = ANY (${Object.keys(TRILHAS_APPEND_ONLY)}::text[]::regclass[])
             AND (c.confdeltype IN ('c', 'n', 'd') OR c.confupdtype IN ('c', 'n', 'd'))`;
        vistas = linhas.map((l) => l.conname);
        throw new Rollback();
      })
      .catch((e: unknown) => {
        if (!(e instanceof Rollback)) throw e;
      });
    expect(vistas, 'a consulta nao enxergou a FK de sonda').toContain(SONDA);

    // E o rollback levou a sonda embora.
    const sobrou = await sql<{ conname: string }[]>`
      SELECT conname FROM pg_constraint WHERE conname = ${SONDA}`;
    expect(sobrou.map((s) => s.conname)).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // D. A recusa, pelo papel com que a aplicacao conecta. Uma por tabela.
  // ---------------------------------------------------------------------------
  it.each(CASOS)('UPDATE em linha existente de $tabela e recusado, e a linha nao muda', async (caso) => {
    const id = await caso.semear(sql);

    // Privilegio PRESENTE: nao e a camada 1 que vai recusar.
    const [priv] = await sql<{ pode: boolean }[]>`
      SELECT has_table_privilege(current_user, ${caso.tabela}, 'UPDATE') AS pode`;
    expect(priv!.pode).toBe(true);

    await expect(caso.adulterar(sql, id)).rejects.toMatchObject({
      // Sentinela que SO o gatilho produz. Codigo de erro nao serve: a camada de
      // privilegio recusaria com 42501 e o gatilho usa 23514 justamente para que
      // os dois sejam distinguiveis, mas quem nomeia a camada e a mensagem.
      message: expect.stringContaining(`trilha-append-only:${caso.tabela}`),
    });

    expect(await caso.lerCampo(sql, id)).toBe(caso.valorOriginal);
    expect(await caso.contar(sql, id)).toBe(1);
  });

  it.each(CASOS)('DELETE de linha existente de $tabela e recusado, e a linha continua la', async (caso) => {
    const id = await caso.semear(sql);

    const [priv] = await sql<{ pode: boolean }[]>`
      SELECT has_table_privilege(current_user, ${caso.tabela}, 'DELETE') AS pode`;
    expect(priv!.pode).toBe(true);

    await expect(caso.apagar(sql, id)).rejects.toMatchObject({
      message: expect.stringContaining(`trilha-append-only:${caso.tabela}`),
    });

    expect(await caso.contar(sql, id)).toBe(1);
  });

  it.each(CASOS)('quem recusa em $tabela e o GATILHO: desligado, o mesmo UPDATE passa (transacao desfeita)', async (caso) => {
    // Controle causal. Sem ele, "rejects" com mensagem combinada ainda deixaria
    // em aberto se outra camada (privilegio, constraint, RLS) recusou.
    const id = await caso.semear(sql);
    const gatilho = TRILHAS_APPEND_ONLY[caso.tabela];
    const SENTINELA = 'desfazer-de-proposito';
    let afetadas = -1;

    await expect(
      sql.begin(async (tx) => {
        await tx.unsafe(`ALTER TABLE ${caso.tabela} DISABLE TRIGGER ${gatilho}`);
        const r = await caso.adulterar(tx, id);
        afetadas = r.count;
        throw new Error(SENTINELA);
      }),
    ).rejects.toThrow(SENTINELA);

    expect(afetadas).toBe(1);

    // A transacao desfeita devolve gatilho habilitado e linha intacta.
    const [estado] = await sql<{ tgenabled: string }[]>`
      SELECT tgenabled FROM pg_trigger
       WHERE tgrelid = ${caso.tabela}::regclass AND tgname = ${gatilho}`;
    expect(estado!.tgenabled).toBe('O');
    expect(await caso.lerCampo(sql, id)).toBe(caso.valorOriginal);
  });

  // ---------------------------------------------------------------------------
  // E. Controles que DEVEM passar: guarda que trava o produto nao e guarda.
  // ---------------------------------------------------------------------------
  it.each(CASOS)('INSERT continua passando em $tabela (a trilha segue recebendo evento)', async (caso) => {
    const id = await caso.semear(sql);
    expect(await caso.contar(sql, id)).toBe(1);
  });

  it.each(CASOS)('a anonimizacao LGPD de ip e user_agent PASSA em $tabela, e o evento fica intacto', async (caso) => {
    // Obrigacao legal (LGPD art. 15 e 16, art. 6 III e V), implementada pela
    // 0048. Um gatilho igual ao da 0074 recusaria isto, e o sintoma apareceria
    // em producao, num job que roda sozinho.
    const id = await caso.semear(sql);
    const r = await caso.anonimizar(sql, id);
    expect(r.count).toBe(1);

    const pii = await caso.lerPii(sql, id);
    expect(pii.ip).toBeNull();
    expect(pii.user_agent).toBeNull();
    // O que sustenta a auditoria de governo continua la.
    expect(await caso.lerCampo(sql, id)).toBe(caso.valorOriginal);
  });

  it.each(CASOS)('escrever um ip NOVO em $tabela e RECUSADO: a excecao e de mao unica', async (caso) => {
    // Sem esta assercao a porta da minimizacao viraria porta para FORJAR origem
    // de acesso, que e pior do que nao ter excecao nenhuma.
    const id = await caso.semear(sql);
    await expect(caso.forjarIp(sql, id)).rejects.toMatchObject({
      message: expect.stringContaining(`trilha-append-only:${caso.tabela}`),
    });
    expect((await caso.lerPii(sql, id)).ip).toBe(IP);
  });

  it.each(CASOS)('anular ip junto com OUTRA coluna e recusado em $tabela', async (caso) => {
    // A excecao exige que o resto da linha esteja IDENTICO. Sem isto, bastaria
    // anular o ip no mesmo UPDATE para reescrever qualquer campo da trilha.
    const id = await caso.semear(sql);
    await expect(
      sql.unsafe(
        `UPDATE ${caso.tabela} SET ip = NULL, user_agent = NULL, ${caso.campo} = $1 WHERE id = $2::uuid`,
        [caso.valorAdulterado, id],
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining(`trilha-append-only:${caso.tabela}`),
    });
    expect(await caso.lerCampo(sql, id)).toBe(caso.valorOriginal);
    expect((await caso.lerPii(sql, id)).ip).toBe(IP);
  });

  it('a funcao da 0048 anonimiza as QUATRO tabelas atravessando o gatilho', async () => {
    // Pelo caminho do produto: `anonimizar_trilha_auditoria` e SECURITY DEFINER
    // e e quem o job de manutencao chama. Prova que a excecao do gatilho esta
    // alinhada com a funcao que existe, e nao com o UPDATE que eu imaginei.
    const ids = new Map<TrilhaAppendOnly, string>();
    for (const caso of CASOS) {
      ids.set(caso.tabela, await caso.semear(sql, 400));
    }

    const relatorio = await sql<{ tabela: string; linhas: string }[]>`
      SELECT tabela, linhas_anonimizadas::text AS linhas
        FROM anonimizar_trilha_auditoria(180)`;
    expect(relatorio.map((l) => l.tabela).sort()).toEqual([
      'acesso_ficha',
      'ana_revisao_evento',
      'postos_evento',
      'triagem_eventos',
    ]);

    for (const caso of CASOS) {
      const id = ids.get(caso.tabela)!;
      const pii = await caso.lerPii(sql, id);
      expect(pii.ip, `${caso.tabela}: ip nao foi anonimizado`).toBeNull();
      expect(pii.user_agent, `${caso.tabela}: user_agent nao foi anonimizado`).toBeNull();
      expect(await caso.lerCampo(sql, id)).toBe(caso.valorOriginal);
    }
  });

  // ---------------------------------------------------------------------------
  // F. As duas mudancas de comportamento que a 0076 provoca, pelo EFEITO.
  // ---------------------------------------------------------------------------
  it('apagar o usuario autor NAO apaga mais a autoria dos eventos dele', async () => {
    // Era o caminho de adulteracao disponivel na propria interface de
    // administracao: `DELETE /api/admin/usuarios/[id]` chama
    // `auth.admin.deleteUser`, e as FKs `ator_id ON DELETE SET NULL` apagavam o
    // autor de TODA a trilha daquele usuario, em silencio.
    const descartavel = '7c7c7c7c-cccc-4ccc-8ccc-cccccccccccc';
    await sql`INSERT INTO auth.users (id, email)
              VALUES (${descartavel}::uuid, 'descartavel.appendonly@exemplo-nx.test')
              ON CONFLICT (id) DO NOTHING`;

    // `acesso_ficha.usuario_id` e TEXT sem FK desde a 0005: nunca teve o
    // problema, e por isso fica fora deste caso.
    const comAtor = CASOS.filter((c) => c.tabela !== 'acesso_ficha');
    const ids = new Map<TrilhaAppendOnly, string>();
    for (const caso of comAtor) {
      // Semeia com o ator descartavel pelo INSERT, que e o unico caminho de
      // escrita que sobrou na trilha.
      ids.set(caso.tabela, await semearComAtor(sql, caso.tabela, descartavel));
    }

    await sql`DELETE FROM auth.users WHERE id = ${descartavel}::uuid`;

    for (const caso of comAtor) {
      const id = ids.get(caso.tabela)!;
      const [linha] = await sql.unsafe<{ ator: string | null }[]>(
        `SELECT ator_id::text AS ator FROM ${caso.tabela} WHERE id = $1::uuid`,
        [id],
      );
      expect(linha, `${caso.tabela}: a linha da trilha desapareceu`).toBeDefined();
      expect(linha!.ator, `${caso.tabela}: a autoria foi apagada`).toBe(descartavel);
    }
  });

  it('apagar a estacao da ANA NAO apaga mais a trilha de revisao dela', async () => {
    // `scripts/seed/importar_inventario_ana.py:491` apaga as estacoes do lote
    // quando a mesma planilha e reimportada: com o CASCADE, a rodada anterior de
    // revisao sumia por rotina de operacao.
    const outraEstacao = await idDe(
      sql<{ id: string }[]>`
        INSERT INTO ana_revisao_estacao (lote_id, codigo_ana)
        VALUES (${loteId}::uuid, 'ZZAPPEND2') RETURNING id`,
    );
    const [evento] = await sql<{ id: string }[]>`
      INSERT INTO ana_revisao_evento (estacao_id, evento, ator_id, observacao)
      VALUES (${outraEstacao}::uuid, 'revisada', ${ATOR}::uuid, 'revisao da rodada anterior')
      RETURNING id`;

    await sql`DELETE FROM ana_revisao_estacao WHERE id = ${outraEstacao}::uuid`;

    const [linha] = await sql<{ estacao: string; observacao: string }[]>`
      SELECT estacao_id::text AS estacao, observacao
        FROM ana_revisao_evento WHERE id = ${evento!.id}::uuid`;
    expect(linha, 'a trilha da estacao foi apagada pela cascata').toBeDefined();
    // A trilha guarda o ID mesmo depois de a estacao deixar de existir.
    expect(linha!.estacao).toBe(outraEstacao);
    expect(linha!.observacao).toBe('revisao da rodada anterior');
  });

  it('TRUNCATE continua possivel para o dono, e continua sendo o buraco conhecido', async () => {
    // Nao e assercao de aprovacao: e o registro medido de que a camada 2 nao
    // alcanca TRUNCATE (nao dispara gatilho de LINHA) e a camada 1 nao alcanca o
    // dono. A contencao disso nao e schema, e quem recebe a credencial de dono
    // (ADR-0024). Medido em transacao DESFEITA para nao apagar massa de outra
    // suite no banco compartilhado do CI.
    class Rollback extends Error {}
    let apagou = false;
    const id = await CASOS[0]!.semear(sql);
    await sql
      .begin(async (tx) => {
        await tx`TRUNCATE acesso_ficha`;
        apagou = (await CASOS[0]!.contar(tx, id)) === 0;
        throw new Rollback();
      })
      .catch((e: unknown) => {
        if (!(e instanceof Rollback)) throw e;
      });
    expect(apagou).toBe(true);
    // E o rollback devolveu a linha: o buraco esta registrado sem custo de massa.
    expect(await CASOS[0]!.contar(sql, id)).toBe(1);
  });
});

/** INSERT de evento com `ator_id` escolhido, para o caso da remocao de usuario. */
async function semearComAtor(sql: Sql, tabela: TrilhaAppendOnly, ator: string): Promise<string> {
  if (tabela === 'triagem_eventos') {
    const [l] = await sql<{ id: string }[]>`
      INSERT INTO triagem_eventos (triagem_id, evento, ator_id, motivo)
      VALUES (${fichaId}::uuid, 'submetida', ${ator}::uuid, 'motivo original do evento')
      RETURNING id`;
    return l!.id;
  }
  if (tabela === 'ana_revisao_evento') {
    const [l] = await sql<{ id: string }[]>`
      INSERT INTO ana_revisao_evento (estacao_id, evento, ator_id, observacao)
      VALUES (${estacaoId}::uuid, 'revisada', ${ator}::uuid, 'observacao original do evento')
      RETURNING id`;
    return l!.id;
  }
  const [l] = await sql<{ id: string }[]>`
    INSERT INTO postos_evento (posto_id, evento, ator_id, observacao)
    VALUES (${POSTO}::uuid, 'criado', ${ator}::uuid, 'observacao original do evento')
    RETURNING id`;
  return l!.id;
}
