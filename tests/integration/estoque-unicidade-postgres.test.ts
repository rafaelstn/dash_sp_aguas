/**
 * Índices únicos do estoque traduzidos para erro de NEGÓCIO no adapter pg, contra
 * POSTGRES REAL (achado M1 do QA): código de etiqueta, nome de categoria, chave
 * do local e dedup do material. Sem a tradução, a violação 23505 virava
 * `FalhaRepositorio` e a tela dizia "tente de novo" para um conflito que nunca
 * se resolve sozinho.
 *
 * A tradução é por NOME do índice, não só pelo código 23505: outro índice único
 * da mesma tabela (chave_import) continua sendo falha de repositório, e há caso
 * que prova isso.
 *
 * Roda apenas com `TEST_DATABASE_URL` apontando para um Postgres descartável com
 * as migrations aplicadas; sem a variável, o arquivo é pulado.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import postgres, { type Sql } from 'postgres';
import {
  CategoriaDuplicada,
  CodigoUnidadeDuplicado,
  FalhaRepositorio,
  LocalDuplicado,
  MaterialDuplicado,
} from '@/domain/errors';

const URL_TESTE = process.env.TEST_DATABASE_URL ?? '';
const rodar = URL_TESTE.length > 0 ? describe : describe.skip;

process.env.DATABASE_URL = URL_TESTE;

type Repos = {
  unidades: typeof import('@/infrastructure/db/estoque-unidades-repository.pg')['estoqueUnidadesRepository'];
  categorias: typeof import('@/infrastructure/db/estoque-categorias-repository.pg')['estoqueCategoriasRepository'];
  locais: typeof import('@/infrastructure/db/estoque-locais-repository.pg')['estoqueLocaisRepository'];
  materiais: typeof import('@/infrastructure/db/estoque-materiais-repository.pg')['estoqueMateriaisRepository'];
};

async function capturar(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error('a operação deveria ter sido recusada');
}

rodar('unicidade do estoque traduzida para 409 de negócio contra Postgres real', () => {
  let sql: Sql;
  let repo: Repos;

  beforeAll(async () => {
    sql = postgres(URL_TESTE, { max: 3, prepare: false, onnotice: () => {} });
    repo = {
      unidades: (await import('@/infrastructure/db/estoque-unidades-repository.pg')).estoqueUnidadesRepository,
      categorias: (await import('@/infrastructure/db/estoque-categorias-repository.pg')).estoqueCategoriasRepository,
      locais: (await import('@/infrastructure/db/estoque-locais-repository.pg')).estoqueLocaisRepository,
      materiais: (await import('@/infrastructure/db/estoque-materiais-repository.pg')).estoqueMateriaisRepository,
    };
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  beforeEach(async () => {
    await sql`TRUNCATE estoque_conferencia_itens, estoque_conferencias,
                       estoque_movimentacoes, estoque_saldos, estoque_unidades,
                       estoque_materiais, estoque_categorias, estoque_locais RESTART IDENTITY CASCADE`;
  });

  describe('unidades', () => {
    it('criar com código existente lança CodigoUnidadeDuplicado com o código, e não grava', async () => {
      await repo.unidades.criar({ descricao: 'A', codigo: '1SPA26PENHA' });
      const e = await capturar(repo.unidades.criar({ descricao: 'B', codigo: '1SPA26PENHA' }));
      expect(e).toBeInstanceOf(CodigoUnidadeDuplicado);
      expect((e as CodigoUnidadeDuplicado).codigo).toBe('1SPA26PENHA');
      expect((e as Error).message).toBe('Já existe um item com o código 1SPA26PENHA.');
      const [contagem] = await sql<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM estoque_unidades`;
      expect(contagem?.n).toBe(1);
    });

    it('atualizar para o código de outra unidade lança CodigoUnidadeDuplicado e mantém o código antigo', async () => {
      await repo.unidades.criar({ descricao: 'A', codigo: '1SPA26PENHA' });
      const b = await repo.unidades.criar({ descricao: 'B', codigo: '2SPA26PENHA' });
      const e = await capturar(repo.unidades.atualizar(b.id, { codigo: '1SPA26PENHA' }));
      expect(e).toBeInstanceOf(CodigoUnidadeDuplicado);
      expect((await repo.unidades.obterPorId(b.id))?.codigo).toBe('2SPA26PENHA');
      expect((await repo.unidades.atualizar(b.id, { codigo: '2SPA26PENHA', descricao: 'B2' })).descricao).toBe('B2');
    });

    it('código que só difere na caixa é recusado no criar e no atualizar (0073), sem alterar o que foi gravado', async () => {
      const a = await repo.unidades.criar({ descricao: 'A', codigo: '001SPA26Arara' });
      const b = await repo.unidades.criar({ descricao: 'B', codigo: '002SPA26Arara' });

      const e1 = await capturar(repo.unidades.criar({ descricao: 'C', codigo: '001spa26arara' }));
      expect(e1).toBeInstanceOf(CodigoUnidadeDuplicado);
      expect((e1 as CodigoUnidadeDuplicado).codigo).toBe('001spa26arara');

      const e2 = await capturar(repo.unidades.atualizar(b.id, { codigo: '001SPA26ARARA' }));
      expect(e2).toBeInstanceOf(CodigoUnidadeDuplicado);

      const gravados = await sql<{ codigo: string }[]>`SELECT codigo FROM estoque_unidades ORDER BY codigo`;
      expect(gravados.map((l) => l.codigo)).toEqual(['001SPA26Arara', '002SPA26Arara']);

      // A própria unidade pode trocar a caixa: grava exatamente como veio (etiqueta impressa).
      expect((await repo.unidades.atualizar(a.id, { codigo: '001spa26ARARA' })).codigo).toBe('001spa26ARARA');
    });

    it('violação de OUTRO índice único da tabela (chave_import) continua FalhaRepositorio', async () => {
      await repo.unidades.criar({ descricao: 'A', codigo: 'X1', chaveImport: 'aba:1' });
      const e = await capturar(repo.unidades.criar({ descricao: 'B', codigo: 'X2', chaveImport: 'aba:1' }));
      expect(e).toBeInstanceOf(FalhaRepositorio);
      expect(e).not.toBeInstanceOf(CodigoUnidadeDuplicado);
    });
  });

  describe('categorias', () => {
    it('criar e atualizar com nome de outra (sem diferenciar caixa) lançam CategoriaDuplicada', async () => {
      await repo.categorias.criar({ nome: 'Cabos' });
      const sensores = await repo.categorias.criar({ nome: 'Sensores' });
      const e1 = await capturar(repo.categorias.criar({ nome: 'cabos' }));
      expect(e1).toBeInstanceOf(CategoriaDuplicada);
      expect((e1 as CategoriaDuplicada).nome).toBe('cabos');
      expect(await capturar(repo.categorias.atualizar(sensores.id, { nome: 'CABOS' }))).toBeInstanceOf(CategoriaDuplicada);
      expect((await repo.categorias.obterPorId(sensores.id))?.nome).toBe('Sensores');
      expect((await repo.categorias.atualizar(sensores.id, { nome: 'sensores' })).nome).toBe('sensores');
    });
  });

  describe('locais', () => {
    it('criar e atualizar para a chave de outro lançam LocalDuplicado com o rótulo', async () => {
      await repo.locais.criar({ unidade: 'PENHA', sala: '2', prateleira: '5b' });
      const outro = await repo.locais.criar({ unidade: 'PENHA', sala: '3' });
      const e1 = await capturar(repo.locais.criar({ unidade: 'PENHA', sala: ' 2 ', prateleira: '5B' }));
      expect(e1).toBeInstanceOf(LocalDuplicado);
      expect((e1 as LocalDuplicado).rotulo).toBe('PENHA / SALA 2 / PRAT 5B');
      expect(await capturar(repo.locais.atualizar(outro.id, { sala: '2', prateleira: '5B' }))).toBeInstanceOf(LocalDuplicado);
      expect((await repo.locais.obterPorId(outro.id))?.rotulo).toBe('PENHA / SALA 3');
    });
  });

  describe('materiais', () => {
    it('criar e atualizar para a chave de outro lançam MaterialDuplicado; outra natureza passa', async () => {
      const base = { descricao: 'Cabo PP', marca: 'Sil', modelo: '2x1', natureza: 'quantificavel' as const };
      await repo.materiais.criar(base);
      expect(await capturar(repo.materiais.criar({ ...base, descricao: 'cabo pp', marca: 'SIL' }))).toBeInstanceOf(MaterialDuplicado);
      const serializado = await repo.materiais.criar({ ...base, natureza: 'serializado' });
      expect(await capturar(repo.materiais.atualizar(serializado.id, { natureza: 'quantificavel' }))).toBeInstanceOf(MaterialDuplicado);
      expect((await repo.materiais.obterPorId(serializado.id))?.natureza).toBe('serializado');
    });
  });
});
