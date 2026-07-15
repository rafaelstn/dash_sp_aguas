import { beforeEach, describe, expect, it } from 'vitest';
import { estoqueMateriaisRepository as materiais } from '@/infrastructure/mock/estoque-materiais-repository.mock';
import { estoqueLocaisRepository as locais } from '@/infrastructure/mock/estoque-locais-repository.mock';
import { estoqueCategoriasRepository as categorias } from '@/infrastructure/mock/estoque-categorias-repository.mock';
import { estoqueUnidadesRepository as unidades } from '@/infrastructure/mock/estoque-unidades-repository.mock';
import { _resetEstoqueMock } from '@/infrastructure/mock/estoque-store.mock';
import { MaterialNaoEncontrado } from '@/domain/errors';
import { normalizarLocal } from '@/domain/estoque/local';

describe('mock estoque, materiais', () => {
  beforeEach(() => _resetEstoqueMock());

  it('cria, filtra por natureza e busca, e pagina', async () => {
    await materiais.criar({ descricao: 'Cabo coaxial', natureza: 'quantificavel' });
    await materiais.criar({ descricao: 'Antena Yagi', natureza: 'quantificavel', marca: 'Aquario' });
    await materiais.criar({ descricao: 'Modem X', natureza: 'serializado' });

    const quant = await materiais.listar({ natureza: 'quantificavel' });
    expect(quant.total).toBe(2);

    const busca = await materiais.listar({ busca: 'aquario' });
    expect(busca.total).toBe(1);
    expect(busca.itens[0]?.descricao).toBe('Antena Yagi');

    const pag = await materiais.listar({ porPagina: 1, pagina: 1 });
    expect(pag.itens).toHaveLength(1);
    expect(pag.total).toBe(3);
  });

  it('inativar faz soft-delete; atualizar em id inexistente lanca', async () => {
    const m = await materiais.criar({ descricao: 'X', natureza: 'quantificavel' });
    const inativado = await materiais.inativar(m.id);
    expect(inativado.ativo).toBe(false);
    await expect(materiais.atualizar('nao-existe', { descricao: 'Y' })).rejects.toBeInstanceOf(
      MaterialNaoEncontrado,
    );
  });

  it('possuiVinculos reflete unidade que referencia o material', async () => {
    const m = await materiais.criar({ descricao: 'Barco', natureza: 'serializado' });
    expect(await materiais.possuiVinculos(m.id)).toBe(false);
    await unidades.criar({ descricao: 'Barco 1', materialId: m.id });
    expect(await materiais.possuiVinculos(m.id)).toBe(true);
  });
});

describe('mock estoque, locais (get-or-create idempotente)', () => {
  beforeEach(() => _resetEstoqueMock());

  it('obterOuCriar nao duplica pela chave natural', async () => {
    const norm = normalizarLocal({ unidade: 'PENHA', sala: ' 2 ', prateleira: '5b' });
    const a = await locais.obterOuCriar(norm);
    const b = await locais.obterOuCriar(normalizarLocal({ unidade: 'PENHA', sala: '2', prateleira: '5B' }));
    expect(a.id).toBe(b.id);
    const todos = await locais.listar();
    expect(todos).toHaveLength(1);
  });

  it('filtra por unidade', async () => {
    await locais.criar({ unidade: 'PENHA', sala: '1' });
    await locais.criar({ unidade: 'ARARAQUARA', sala: '1' });
    const penha = await locais.listar({ unidade: 'PENHA' });
    expect(penha).toHaveLength(1);
    expect(penha[0]?.unidade).toBe('PENHA');
  });
});

describe('mock estoque, categorias', () => {
  beforeEach(() => _resetEstoqueMock());

  it('obterOuCriarPorNome e case-insensitive e nao duplica', async () => {
    const a = await categorias.obterOuCriarPorNome('Cabos');
    const b = await categorias.obterOuCriarPorNome('cabos');
    expect(a.id).toBe(b.id);
    expect(await categorias.listar()).toHaveLength(1);
  });
});
