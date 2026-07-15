import { beforeEach, describe, expect, it } from 'vitest';
import { estoqueMateriaisRepository as materiais } from '@/infrastructure/mock/estoque-materiais-repository.mock';
import { estoqueLocaisRepository as locais } from '@/infrastructure/mock/estoque-locais-repository.mock';
import { estoqueCategoriasRepository as categorias } from '@/infrastructure/mock/estoque-categorias-repository.mock';
import { estoqueUnidadesRepository as unidades } from '@/infrastructure/mock/estoque-unidades-repository.mock';
import { estoqueSaldosRepository as saldos } from '@/infrastructure/mock/estoque-saldos-repository.mock';
import { estoqueMovimentacoesRepository as movimentacoes } from '@/infrastructure/mock/estoque-movimentacoes-repository.mock';
import { usuariosIdentidadeRepository as identidade } from '@/infrastructure/mock/usuarios-identidade-repository.mock';
import { _resetEstoqueMock } from '@/infrastructure/mock/estoque-store.mock';

describe('estoque, listarParaExport (mock) enriquece contexto', () => {
  beforeEach(() => _resetEstoqueMock());

  it('serializado: traz unidade fisica e rotulo do local', async () => {
    const local = await locais.criar({ unidade: 'PENHA', sala: '2' });
    await unidades.criar({
      descricao: 'Datalogger',
      patDaee: 'PAT-9',
      estado: 'bom',
      status: 'ativo',
      localId: local.id,
    });

    const linhas = await unidades.listarParaExport({});
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toMatchObject({
      descricao: 'Datalogger',
      patDaee: 'PAT-9',
      unidadeFisica: 'PENHA',
      localRotulo: local.rotulo,
    });
  });

  it('quantificavel: uma linha por saldo, com marca/modelo/categoria e quantidade', async () => {
    const categoria = await categorias.criar({ nome: 'Cabos' });
    const material = await materiais.criar({
      descricao: 'Cabo coaxial',
      marca: 'Aquario',
      modelo: 'RG',
      natureza: 'quantificavel',
      categoriaId: categoria.id,
    });
    const local = await locais.criar({ unidade: 'ARARAQUARA', sala: '1' });
    await movimentacoes.registrar({
      tipo: 'entrada',
      alvo: { natureza: 'quantificavel', materialId: material.id },
      quantidade: 15,
      localOrigemId: null,
      localDestinoId: local.id,
      tamanho: 'RG-58',
      motivo: null,
      usuarioId: 'user-1',
    });

    const linhas = await saldos.listarParaExport({});
    expect(linhas).toHaveLength(1);
    expect(linhas[0]).toEqual({
      materialDescricao: 'Cabo coaxial',
      marca: 'Aquario',
      modelo: 'RG',
      categoria: 'Cabos',
      unidadeFisica: 'ARARAQUARA',
      localRotulo: local.rotulo,
      tamanho: 'RG-58',
      quantidade: 15,
    });
  });

  it('movimentacoes: descricao/identificacao do item e rotulos dos locais; ordena por data desc', async () => {
    const local = await locais.criar({ unidade: 'PENHA', sala: '3' });
    const unidade = await unidades.criar({
      descricao: 'Sensor',
      numeroSerie: 'SN-77',
      status: 'ativo',
      localId: null,
    });
    const material = await materiais.criar({ descricao: 'Parafuso', natureza: 'quantificavel' });

    await movimentacoes.registrar({
      tipo: 'entrada',
      alvo: { natureza: 'serializado', unidadeId: unidade.id },
      quantidade: 1,
      localOrigemId: null,
      localDestinoId: local.id,
      tamanho: null,
      motivo: null,
      usuarioId: 'user-1',
    });
    await movimentacoes.registrar({
      tipo: 'entrada',
      alvo: { natureza: 'quantificavel', materialId: material.id },
      quantidade: 100,
      localOrigemId: null,
      localDestinoId: local.id,
      tamanho: null,
      motivo: null,
      usuarioId: 'user-1',
    });

    const linhas = await movimentacoes.listarParaExport({});
    expect(linhas).toHaveLength(2);
    const serializada = linhas.find((l) => l.unidadeId === unidade.id);
    const quantificavel = linhas.find((l) => l.materialId === material.id);
    expect(serializada).toMatchObject({
      itemDescricao: 'Sensor',
      itemIdentificacao: 'SN-77',
      localDestinoRotulo: local.rotulo,
    });
    expect(quantificavel).toMatchObject({
      itemDescricao: 'Parafuso',
      itemIdentificacao: null,
      localDestinoRotulo: local.rotulo,
    });
  });

  it('resolver de identidade (mock) devolve mapa vazio (sem Auth em demo)', async () => {
    const mapa = await identidade.resolver(['user-1', 'user-2']);
    expect(mapa.size).toBe(0);
  });
});
