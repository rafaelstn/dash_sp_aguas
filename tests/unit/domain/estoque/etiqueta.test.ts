import { beforeEach, describe, expect, it } from 'vitest';
import { montarItemEtiqueta, type ItemEtiqueta } from '@/domain/estoque/etiqueta';
import type { UnidadeExport } from '@/domain/estoque/export';
import { estoqueLocaisRepository as locais } from '@/infrastructure/mock/estoque-locais-repository.mock';
import { estoqueUnidadesRepository as unidades } from '@/infrastructure/mock/estoque-unidades-repository.mock';
import { _resetEstoqueMock } from '@/infrastructure/mock/estoque-store.mock';

// Chaves EXATAS que a etiqueta expoe. Trava o contrato com o frontend: se alguem
// adicionar campo (ex. PII, observacao) o teste quebra de proposito.
const CHAVES_ETIQUETA = [
  'id',
  'codigo',
  'patDaee',
  'numeroSerie',
  'descricao',
  'marca',
  'modelo',
  'localRotulo',
  'estado',
  'status',
] as const;

describe('montarItemEtiqueta (puro): projeta o shape minimo da etiqueta', () => {
  it('seleciona so os campos da etiqueta e nada de peso/PII', () => {
    const linha: UnidadeExport = {
      id: 'u-1',
      materialId: 'mat-1',
      codigo: 'C-1',
      codigoSpaguas: 'LOTE-1',
      patDaee: 'PAT-9',
      outrosPat: 'OUT-1',
      numeroSerie: 'SN-77',
      helice: 'H-1',
      descricao: 'Datalogger',
      marca: 'Campbell',
      modelo: 'CR1000',
      estado: 'bom',
      status: 'ativo',
      localId: 'loc-1',
      dataAquisicao: '2024-01-10',
      observacao: 'texto interno sensivel',
      chaveImport: 'chave-1',
      criadoEm: new Date('2024-01-10T00:00:00Z'),
      atualizadoEm: new Date('2024-02-10T00:00:00Z'),
      unidadeFisica: 'PENHA',
      localRotulo: 'PENHA / SALA 2A',
    };

    const item = montarItemEtiqueta(linha);

    expect(item).toEqual<ItemEtiqueta>({
      id: 'u-1',
      codigo: 'C-1',
      patDaee: 'PAT-9',
      numeroSerie: 'SN-77',
      descricao: 'Datalogger',
      marca: 'Campbell',
      modelo: 'CR1000',
      localRotulo: 'PENHA / SALA 2A',
      estado: 'bom',
      status: 'ativo',
    });
    // Sem vazar observacao/datas/ids de relacionamento nem lote/helice.
    expect(Object.keys(item).sort()).toEqual([...CHAVES_ETIQUETA].sort());
  });

  it('preserva os nulos (campo opcional sem valor vira null, nao some)', () => {
    const linha = {
      id: 'u-2',
      materialId: null,
      codigo: null,
      codigoSpaguas: null,
      patDaee: null,
      outrosPat: null,
      numeroSerie: null,
      helice: null,
      descricao: 'Sensor sem local',
      marca: null,
      modelo: null,
      estado: null,
      status: 'ativo',
      localId: null,
      dataAquisicao: null,
      observacao: null,
      chaveImport: null,
      criadoEm: new Date(),
      atualizadoEm: new Date(),
      unidadeFisica: null,
      localRotulo: null,
    } satisfies UnidadeExport;

    const item = montarItemEtiqueta(linha);
    expect(item.localRotulo).toBeNull();
    expect(item.estado).toBeNull();
    expect(item.marca).toBeNull();
    expect(item.descricao).toBe('Sensor sem local');
  });
});

describe('etiquetas via mock/repo: filtro aplicado + shape minimo', () => {
  beforeEach(() => _resetEstoqueMock());

  it('filtra por unidade fisica e projeta so os campos da etiqueta', async () => {
    const penha = await locais.criar({ unidade: 'PENHA', sala: '2A' });
    const araraquara = await locais.criar({ unidade: 'ARARAQUARA', sala: '1' });

    await unidades.criar({
      descricao: 'Datalogger Penha',
      codigo: 'C-P',
      patDaee: 'PAT-P',
      numeroSerie: 'SN-P',
      marca: 'Campbell',
      modelo: 'CR1000',
      estado: 'bom',
      status: 'ativo',
      localId: penha.id,
    });
    await unidades.criar({
      descricao: 'Sensor Araraquara',
      status: 'ativo',
      localId: araraquara.id,
    });

    // Mesmo filtro da listagem/export, sem paginacao.
    const linhas = await unidades.listarParaExport({ unidade: 'PENHA' });
    const itens = linhas.map(montarItemEtiqueta);

    // Filtro aplicado: so a unidade de PENHA volta.
    expect(itens).toHaveLength(1);
    expect(itens[0]).toEqual({
      id: expect.any(String),
      codigo: 'C-P',
      patDaee: 'PAT-P',
      numeroSerie: 'SN-P',
      descricao: 'Datalogger Penha',
      marca: 'Campbell',
      modelo: 'CR1000',
      localRotulo: penha.rotulo,
      estado: 'bom',
      status: 'ativo',
    });
    // localRotulo ja vem legivel com a unidade fisica no prefixo.
    expect(itens[0]!.localRotulo).toBe('PENHA / SALA 2A');
    expect(Object.keys(itens[0]!).sort()).toEqual([...CHAVES_ETIQUETA].sort());
  });
});
