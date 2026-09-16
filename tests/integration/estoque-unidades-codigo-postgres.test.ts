/**
 * Filtro `codigo` do repositorio de unidades contra POSTGRES REAL.
 *
 * A leitura do codigo de barras da etiqueta precisa achar UMA unidade: a busca
 * textual (`busca`) e ILIKE de substring, e "1SPA26PENHA" casa com
 * "11SPA26PENHA", "21SPA26PENHA"... O filtro `codigo` e igualdade sem
 * diferenciar caixa (o leitor devolve "001SPA26ARARA" para "001SPA26Arara").
 *
 * Roda apenas com `TEST_DATABASE_URL` apontando para um Postgres descartavel
 * com as migrations aplicadas; sem a variavel, o arquivo e pulado.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import postgres, { type Sql } from 'postgres';

const URL_TESTE = process.env.TEST_DATABASE_URL ?? '';
const rodar = URL_TESTE.length > 0 ? describe : describe.skip;

process.env.DATABASE_URL = URL_TESTE;

rodar('filtro por codigo exato de unidade contra Postgres real', () => {
  let sql: Sql;
  let repo: typeof import('@/infrastructure/db/estoque-unidades-repository.pg')['estoqueUnidadesRepository'];

  beforeAll(async () => {
    sql = postgres(URL_TESTE, { max: 3, prepare: false });
    repo = (await import('@/infrastructure/db/estoque-unidades-repository.pg'))
      .estoqueUnidadesRepository;
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  beforeEach(async () => {
    await sql`TRUNCATE estoque_conferencia_itens, estoque_conferencias,
                       estoque_movimentacoes, estoque_saldos, estoque_unidades,
                       estoque_materiais, estoque_locais RESTART IDENTITY CASCADE`;
    for (const codigo of ['1SPA26PENHA', '11SPA26PENHA', '21SPA26PENHA', '001SPA26Arara']) {
      await repo.criar({ descricao: `Item ${codigo}`, codigo });
    }
    await repo.criar({ descricao: 'Modem sem codigo', numeroSerie: '359911030501121' });
  });

  it('busca textual casa por substring (motivo de existir o filtro exato)', async () => {
    const { total } = await repo.listar({ busca: '1SPA26PENHA' });
    expect(total).toBe(3);
  });

  it('busca de patrimonio ignora espaco e alcanca outros_pat (Ver nos itens da desconformidade)', async () => {
    await repo.criar({ descricao: 'Pluviometro A', patDaee: '17264/40786' });
    await repo.criar({ descricao: 'Pluviometro B', patDaee: '17264 / 40786' });
    await repo.criar({ descricao: 'Pluviometro C', outrosPat: '17264/40786' });
    await repo.criar({ descricao: 'Pluviometro D', patDaee: '17264/40787' });
    const { itens, total } = await repo.listar({ busca: '17264/40786' });
    expect(total).toBe(3);
    expect(itens.map((u) => u.descricao).sort()).toEqual(['Pluviometro A', 'Pluviometro B', 'Pluviometro C']);
    expect((await repo.listar({ busca: '17264 / 40786' })).total).toBe(3);
  });

  it('busca por descricao continua respeitando o espaco', async () => {
    expect((await repo.listar({ busca: 'Modem sem' })).total).toBe(1);
    expect((await repo.listar({ busca: 'Modemsem' })).total).toBe(0);
  });

  it('codigo exato devolve so a unidade daquele codigo', async () => {
    const { itens, total } = await repo.listar({ codigo: '1SPA26PENHA' });
    expect(total).toBe(1);
    expect(itens.map((u) => u.codigo)).toEqual(['1SPA26PENHA']);
  });

  it('codigo ignora a caixa da leitura', async () => {
    const { itens, total } = await repo.listar({ codigo: '001SPA26ARARA' });
    expect(total).toBe(1);
    expect(itens[0]?.codigo).toBe('001SPA26Arara');
  });

  it('codigo inexistente ou parcial nao devolve nada', async () => {
    expect((await repo.listar({ codigo: 'SPA26PENHA' })).total).toBe(0);
    expect((await repo.listar({ codigo: '999SPA26PENHA' })).total).toBe(0);
  });

  it('codigo trata curinga do LIKE como texto', async () => {
    expect((await repo.listar({ codigo: '%' })).total).toBe(0);
    expect((await repo.listar({ codigo: '_SPA26PENHA' })).total).toBe(0);
  });
});
