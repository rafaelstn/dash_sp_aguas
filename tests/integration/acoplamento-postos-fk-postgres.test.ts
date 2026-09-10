/**
 * Regua de catalogo: NENHUMA chave estrangeira aponta para `postos` contra
 * POSTGRES REAL.
 *
 * Por que existe. O ADR-0023 tirou o cadastro de postos do nosso banco e passou
 * a le-lo ao vivo do orgao, deixando `postos` vazia em producao. Qualquer FK
 * apontando para `postos` passa a RECUSAR a escrita de quem se refere a um
 * posto. Isso ja causou dois incidentes: o Monitor (2.714 estacoes recusadas,
 * corrigido na 0067) e a gravacao de ficha, favorito e foto (nove FKs, medidas
 * em producao em 10/09/2026, corrigidas na 0069).
 *
 * A guarda que existia (tests/unit/.../estacoes-pluviometricas-repository.test.ts)
 * media UMA tabela pelo nome literal. Esta pergunta ao CATALOGO do banco, e nao
 * ao texto das migrations: texto nao e efeito (a 0067 provou, o DROP so valeu
 * por acertar o nome real). E ela e NOMEADA, nao contada: nao envelhece quando
 * o sistema cresce por motivo legitimo, e diz QUEM entrou.
 *
 * A lista de permissao nasce VAZIA: apos a 0069, nenhuma FK para `postos` e
 * aceitavel, porque o cadastro nao mora mais aqui. Uma entrada nova aqui exige,
 * escrito ao lado, por que aquele acoplamento e aceitavel apesar de `postos`
 * ser vazia por desenho.
 *
 * Roda apenas com `TEST_DATABASE_URL` (o job `integracao` do CI sobe um Postgres
 * descartavel). Sem a variavel, o arquivo e pulado e nunca toca producao.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres, { type Sql, type TransactionSql } from 'postgres';

const URL_TESTE = process.env.TEST_DATABASE_URL ?? '';
const rodar = URL_TESTE.length > 0 ? describe : describe.skip;

/**
 * Acoplamentos de integridade contra `postos` que sao tolerados, cada um com o
 * motivo escrito. VAZIA por decisao: depois da 0069 nao ha nenhum. Formato de
 * cada entrada: `<tabela>.<coluna>`.
 */
const PERMITIDOS = new Map<string, string>([
  // (vazio)
]);

rodar('acoplamento de integridade com o cadastro de postos', () => {
  let sql: Sql;

  beforeAll(() => {
    sql = postgres(URL_TESTE, { max: 3, prepare: false });
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  /** Toda FK cujo alvo e `postos`, como `<tabela>.<coluna>`, lida do catalogo. */
  async function fksParaPostos(tx: Sql | TransactionSql = sql): Promise<string[]> {
    const linhas = await tx<{ alvo: string }[]>`
      SELECT (c.conrelid::regclass)::text || '.' ||
             (SELECT a.attname FROM pg_attribute a
               WHERE a.attrelid = c.conrelid AND a.attnum = c.conkey[1]) AS alvo
        FROM pg_constraint c
       WHERE c.contype = 'f'
         AND c.confrelid = 'postos'::regclass
       ORDER BY alvo`;
    return linhas.map((l) => l.alvo);
  }

  it('nenhuma FK aponta para postos fora da lista de permissao', async () => {
    const encontradas = await fksParaPostos();
    const infratoras = encontradas.filter((fk) => !PERMITIDOS.has(fk));
    // Mensagem que NOMEIA, para quem investigar nao precisar consultar o banco.
    expect(infratoras, `FK(s) para postos fora da lista: ${infratoras.join(', ')}`).toEqual([]);
  });

  it('toda entrada da lista de permissao ainda existe no banco', async () => {
    // Sem isto, uma entrada obsoleta na lista viraria porta dos fundos: cobriria
    // uma FK futura de mesmo nome que ninguem decidiu tolerar.
    const encontradas = new Set(await fksParaPostos());
    const orfas = [...PERMITIDOS.keys()].filter((fk) => !encontradas.has(fk));
    expect(orfas, `entradas na lista que nao existem mais: ${orfas.join(', ')}`).toEqual([]);
  });

  it('a regua ENXERGA uma FK para postos: prova por sonda em transacao desfeita', async () => {
    // Guarda da guarda. Se alguem trocar confrelid/contype e a consulta parar de
    // enxergar qualquer coisa, ela devolveria conjunto vazio e declararia
    // conformidade por vacuidade. Aqui cria-se uma FK de sonda e afirma-se que a
    // consulta a NOMEIA, tudo dentro de um ROLLBACK: nada fica no banco.
    await sql.begin(async (tx) => {
      // Tabela normal, nao TEMP: o Postgres proibe FK de tabela temporaria para
      // tabela permanente ("constraints on temporary tables may reference only
      // temporary tables"). O ROLLBACK ao fim da transacao a remove por
      // completo, sem resto.
      await tx`CREATE TABLE sonda_fk (
                 id uuid PRIMARY KEY,
                 prefixo varchar(32) REFERENCES postos (prefixo)
               )`;
      const vistas = await fksParaPostos(tx);
      const sonda = vistas.filter((fk) => fk.startsWith('sonda_fk.'));
      expect(sonda.length, 'a consulta nao enxergou a FK de sonda').toBeGreaterThan(0);
      // desfaz tudo
      throw new RollbackSonda();
    }).catch((e: unknown) => {
      if (!(e instanceof RollbackSonda)) throw e;
    });

    // E o banco volta ao estado real: nenhuma sonda sobrou.
    const depois = (await fksParaPostos()).filter((fk) => fk.startsWith('sonda_fk.'));
    expect(depois).toEqual([]);
  });
});

class RollbackSonda extends Error {}
