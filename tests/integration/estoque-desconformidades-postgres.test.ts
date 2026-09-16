/**
 * Repositório pg das desconformidades do estoque contra POSTGRES REAL: ordem da
 * fila, contagem por status, decisão com o status anterior, reabrir limpando e
 * FK de unidade traduzida para UnidadeNaoEncontrada.
 *
 * Roda apenas com `TEST_DATABASE_URL` apontando para um Postgres descartável
 * com as migrations aplicadas (inclusive a 0071); sem a variável, o arquivo é pulado.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import postgres, { type Sql } from 'postgres';
import { randomUUID } from 'node:crypto';
import { UnidadeNaoEncontrada } from '@/domain/errors';
import { DesconformidadeAlterada, DesconformidadeNaoEncontrada } from '@/domain/estoque/desconformidade';

const URL_TESTE = process.env.TEST_DATABASE_URL ?? '';
const rodar = URL_TESTE.length > 0 ? describe : describe.skip;

process.env.DATABASE_URL = URL_TESTE;

const USUARIO = '11111111-1111-4111-8111-111111111111';

rodar('repositório de desconformidades do estoque contra Postgres real', () => {
  let sql: Sql;
  let repo: typeof import('@/infrastructure/db/estoque-desconformidades-repository.pg')['estoqueDesconformidadesRepository'];

  async function semear(p: { tipo: string; aba?: string | null; linha?: number | null; status?: string }) {
    const decidida = p.status && p.status !== 'aberta';
    const [r] = await sql<{ id: string }[]>`
      INSERT INTO estoque_desconformidades (tipo, aba, linha, detalhe, dados, chave, status, nota, resolvida_por, resolvida_em)
      VALUES (${p.tipo}, ${p.aba ?? null}, ${p.linha ?? null}, 'detalhe de teste', ${sql.json({ valor: 'X' })},
              ${randomUUID()}, ${p.status ?? 'aberta'}, ${decidida ? 'nota semeada' : null},
              ${decidida ? USUARIO : null}, ${decidida ? sql`NOW()` : null})
      RETURNING id`;
    return r!.id;
  }

  beforeAll(async () => {
    // onnotice mudo: o ROLLBACK de segurança da corrida real, depois do COMMIT, avisa 25P01.
    sql = postgres(URL_TESTE, { max: 3, prepare: false, onnotice: () => {} });
    repo = (await import('@/infrastructure/db/estoque-desconformidades-repository.pg'))
      .estoqueDesconformidadesRepository;
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  beforeEach(async () => {
    await sql`TRUNCATE estoque_desconformidades`;
  });

  it('ordem: aberta primeiro, tipo, aba com nula no fim, linha; contagem ignora status e respeita tipo', async () => {
    const resolvida = await semear({ tipo: 'chave_repetida', aba: 'A', linha: 1, status: 'resolvida' });
    const semAba = await semear({ tipo: 'chave_repetida', aba: null, linha: null });
    const b5 = await semear({ tipo: 'chave_repetida', aba: 'B', linha: 5 });
    const b2 = await semear({ tipo: 'chave_repetida', aba: 'B', linha: 2 });
    const outroTipo = await semear({ tipo: 'quantidade_vazia', aba: 'A', linha: 1 });

    const todas = await repo.listar({ pagina: 1, porPagina: 50 });
    expect(todas.itens.map((d) => d.id)).toEqual([b2, b5, semAba, outroTipo, resolvida]);
    expect(todas.total).toBe(5);
    expect(todas.contagem).toEqual({ aberta: 4, resolvida: 1, ignorada: 0 });
    expect(todas.itens[0]?.dados).toEqual({ valor: 'X' });

    const doTipo = await repo.listar({ tipo: 'chave_repetida', status: 'aberta', pagina: 1, porPagina: 2 });
    expect(doTipo.itens.map((d) => d.id)).toEqual([b2, b5]);
    expect(doTipo.total).toBe(3);
    expect(doTipo.contagem).toEqual({ aberta: 3, resolvida: 1, ignorada: 0 });

    const pagina2 = await repo.listar({ tipo: 'chave_repetida', status: 'aberta', pagina: 2, porPagina: 2 });
    expect(pagina2.itens.map((d) => d.id)).toEqual([semAba]);
  });

  it('decidir devolve o status anterior; reabrir limpa a decisão inteira', async () => {
    const id = await semear({ tipo: 'item_sem_descricao', aba: 'GERAL', linha: 17 });
    const r1 = await repo.decidir(id, { status: 'ignorada', nota: 'não é problema', unidadeId: null, resolvidaPor: USUARIO });
    expect(r1.anterior).toBe('aberta');
    expect(r1.atual).toMatchObject({ status: 'ignorada', nota: 'não é problema', resolvidaPor: USUARIO });
    expect(r1.atual.resolvidaEm).toBeInstanceOf(Date);

    expect(r1.decisaoAnterior).toEqual({ resolvidaPor: null, resolvidaEm: null, unidadeId: null });

    const r2 = await repo.decidir(id, { status: 'aberta', nota: null, unidadeId: null, resolvidaPor: null });
    expect(r2.anterior).toBe('ignorada');
    expect(r2.decisaoAnterior).toEqual({ resolvidaPor: USUARIO, resolvidaEm: r1.atual.resolvidaEm, unidadeId: null });
    expect(r2.atual).toMatchObject({ status: 'aberta', nota: null, unidadeId: null, resolvidaPor: null, resolvidaEm: null });
  });

  it('id inexistente lança DesconformidadeNaoEncontrada; unidade inexistente lança UnidadeNaoEncontrada', async () => {
    await expect(
      repo.decidir(randomUUID(), { status: 'resolvida', nota: 'ok ok', unidadeId: null, resolvidaPor: USUARIO }),
    ).rejects.toBeInstanceOf(DesconformidadeNaoEncontrada);

    const id = await semear({ tipo: 'item_sem_descricao', aba: 'GERAL', linha: 18 });
    await expect(
      repo.decidir(id, { status: 'resolvida', nota: 'ok ok', unidadeId: randomUUID(), resolvidaPor: USUARIO }),
    ).rejects.toBeInstanceOf(UnidadeNaoEncontrada);
    const depois = await repo.obterPorId(id);
    expect(depois?.status).toBe('aberta');
  });

  describe('statusEsperado: decisão concorrente não sobrescreve', () => {
    it('status diferente do esperado lança DesconformidadeAlterada e não grava', async () => {
      const id = await semear({ tipo: 'item_sem_descricao', status: 'ignorada' });
      const e = await repo
        .decidir(id, { status: 'resolvida', nota: 'decisão de B', unidadeId: null, resolvidaPor: USUARIO }, { statusEsperado: 'aberta' })
        .then(() => null, (erro: unknown) => erro);
      expect(e).toBeInstanceOf(DesconformidadeAlterada);
      expect((e as DesconformidadeAlterada).encontrado).toBe('ignorada');
      const depois = await repo.obterPorId(id);
      expect(depois).toMatchObject({ status: 'ignorada', nota: 'nota semeada' });
    });

    it('status igual ao esperado grava; sem statusEsperado grava como antes', async () => {
      const id = await semear({ tipo: 'item_sem_descricao' });
      const r1 = await repo.decidir(id, { status: 'resolvida', nota: 'ok ok', unidadeId: null, resolvidaPor: USUARIO }, { statusEsperado: 'aberta' });
      expect(r1.atual.status).toBe('resolvida');
      const r2 = await repo.decidir(id, { status: 'ignorada', nota: 'por cima', unidadeId: null, resolvidaPor: USUARIO });
      expect(r2).toMatchObject({ anterior: 'resolvida', atual: { status: 'ignorada', nota: 'por cima' } });
    });

    it('id inexistente com statusEsperado continua DesconformidadeNaoEncontrada', async () => {
      await expect(
        repo.decidir(randomUUID(), { status: 'resolvida', nota: 'ok ok', unidadeId: null, resolvidaPor: USUARIO }, { statusEsperado: 'aberta' }),
      ).rejects.toBeInstanceOf(DesconformidadeNaoEncontrada);
    });

    it('corrida real: a decisão que esperava "aberta" espera a outra transação e é recusada depois do commit dela', async () => {
      const id = await semear({ tipo: 'item_sem_descricao' });
      // Pessoa A abre a transação e decide primeiro, segurando a linha.
      const reservada = await sql.reserve();
      try {
        await reservada`BEGIN`;
        await reservada`
          UPDATE estoque_desconformidades
             SET status = 'ignorada', nota = 'decisão de A', resolvida_por = ${USUARIO}::uuid, resolvida_em = NOW()
           WHERE id = ${id}::uuid`;

        // Pessoa B leu "aberta" na lista e manda a decisão dela: fica bloqueada no lock.
        let terminou = false;
        const decisaoB = repo
          .decidir(id, { status: 'resolvida', nota: 'decisão de B', unidadeId: null, resolvidaPor: USUARIO }, { statusEsperado: 'aberta' })
          .then(
            () => null,
            (erro: unknown) => erro,
          )
          .finally(() => {
            terminou = true;
          });

        // Espera por ESTADO: B aparece aguardando lock no pg_stat_activity.
        let bloqueada = false;
        for (let i = 0; i < 100 && !bloqueada; i += 1) {
          const [espera] = await sql<{ n: number }[]>`
            SELECT COUNT(*)::int AS n FROM pg_stat_activity
             WHERE datname = current_database() AND wait_event_type = 'Lock'
               AND query ILIKE '%estoque_desconformidades%'`;
          bloqueada = (espera?.n ?? 0) > 0;
          if (!bloqueada) await new Promise((r) => setTimeout(r, 50));
        }
        expect(bloqueada).toBe(true);
        expect(terminou).toBe(false);

        await reservada`COMMIT`;
        const erroB = await decisaoB;
        expect(erroB).toBeInstanceOf(DesconformidadeAlterada);
      } finally {
        await reservada`ROLLBACK`.catch(() => {});
        reservada.release();
      }
      const final = await repo.obterPorId(id);
      expect(final).toMatchObject({ status: 'ignorada', nota: 'decisão de A' });
    });
  });
});
