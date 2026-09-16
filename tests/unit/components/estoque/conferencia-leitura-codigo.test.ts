import { describe, it, expect } from 'vitest';
import type { ConferenciaItemDTO } from '@/components/features/estoque/conferencia-dtos';
import {
  decidirLeituraCodigo,
  mensagemLeituraCodigo,
} from '@/components/features/estoque/conferencia-ui';

const UNIDADE_NO_ESCOPO = '11111111-1111-1111-1111-111111111111';
const UNIDADE_FORA = '33333333-3333-3333-3333-333333333333';

function serial(over: Partial<ConferenciaItemDTO>): ConferenciaItemDTO {
  return {
    id: 'item-1',
    conferenciaId: 'conf-1',
    unidadeId: UNIDADE_NO_ESCOPO,
    materialId: null,
    localEsperadoId: null,
    tamanho: null,
    origem: 'snapshot',
    situacao: 'pendente',
    localEncontradoId: null,
    quantidadeSistema: null,
    quantidadeContada: null,
    diferenca: null,
    observacao: null,
    contadoPor: null,
    contadoEm: null,
    movimentacaoId: null,
    reconciliadoPor: null,
    reconciliadoEm: null,
    criadoEm: '2026-09-16T10:00:00Z',
    atualizadoEm: '2026-09-16T10:00:00Z',
    ...over,
  };
}

const rotulo = (i: ConferenciaItemDTO) => `Pluviômetro ${i.id}`;

function decidir(over: Partial<Parameters<typeof decidirLeituraCodigo>[0]> = {}) {
  return decidirLeituraCodigo({
    codigo: '001SPA26ARARA',
    unidadesEncontradas: [{ id: UNIDADE_NO_ESCOPO }],
    totalEncontrado: 1,
    itens: [serial({})],
    listaParcial: false,
    ...over,
  });
}

describe('decidirLeituraCodigo', () => {
  it('campo vazio ou só espaço não faz nada', () => {
    expect(decidir({ codigo: '   ' })).toEqual({ tipo: 'vazio' });
  });

  it('nenhuma unidade com o código', () => {
    expect(decidir({ unidadesEncontradas: [], totalEncontrado: 0 })).toEqual({
      tipo: 'nenhum',
      codigo: '001SPA26ARARA',
    });
  });

  it('mais de uma unidade: decide pelo TOTAL, não pelo tamanho da página', () => {
    expect(decidir({ totalEncontrado: 3 }).tipo).toBe('varios');
    expect(
      decidir({ unidadesEncontradas: [{ id: 'a' }, { id: 'b' }], totalEncontrado: 2 }).tipo,
    ).toBe('varios');
  });

  it('uma unidade no escopo e pendente: registra, com o item certo', () => {
    const outro = serial({ id: 'item-2', unidadeId: UNIDADE_FORA });
    const alvo = serial({ id: 'item-9' });
    const d = decidir({ itens: [outro, alvo] });
    expect(d.tipo).toBe('registrar');
    if (d.tipo === 'registrar') expect(d.item.id).toBe('item-9');
  });

  it('já conferido: só avisa', () => {
    expect(decidir({ itens: [serial({ situacao: 'conferido' })] }).tipo).toBe('ja_conferido');
  });

  it('contado com outra situação: a leitura prova presença e registra conferido', () => {
    expect(decidir({ itens: [serial({ situacao: 'nao_encontrado' })] }).tipo).toBe('registrar');
    expect(
      decidir({ itens: [serial({ situacao: 'encontrado_em_outro_local' })] }).tipo,
    ).toBe('registrar');
  });

  it('unidade fora do escopo não registra nada', () => {
    expect(decidir({ unidadesEncontradas: [{ id: UNIDADE_FORA }] }).tipo).toBe('fora_do_escopo');
  });

  it('com lista parcial, não afirma que está fora do escopo', () => {
    expect(
      decidir({ unidadesEncontradas: [{ id: UNIDADE_FORA }], listaParcial: true }).tipo,
    ).toBe('fora_da_lista_carregada');
  });

  it('item quantificável (sem unidade) nunca casa com a leitura', () => {
    const quant = serial({ unidadeId: null, materialId: 'm-1', situacao: null });
    expect(decidir({ itens: [quant] }).tipo).toBe('fora_do_escopo');
  });
});

describe('mensagemLeituraCodigo', () => {
  it('usa o código lido e o nome resolvido do item', () => {
    expect(mensagemLeituraCodigo({ tipo: 'nenhum', codigo: 'X1' }, rotulo)).toEqual({
      tom: 'erro',
      texto: 'Nenhum item com o código X1.',
    });
    expect(mensagemLeituraCodigo({ tipo: 'registrar', codigo: 'X1', item: serial({}) }, rotulo))
      .toEqual({ tom: 'sucesso', texto: 'Pluviômetro item-1 conferido.' });
    expect(
      mensagemLeituraCodigo({ tipo: 'ja_conferido', codigo: 'X1', item: serial({}) }, rotulo).texto,
    ).toBe('Pluviômetro item-1 já estava conferido.');
  });

  it('fora do escopo orienta "Adicionar sobra"; vários pede conferência manual', () => {
    expect(mensagemLeituraCodigo({ tipo: 'fora_do_escopo', codigo: 'X1' }, rotulo).texto).toContain(
      'Adicionar sobra',
    );
    expect(mensagemLeituraCodigo({ tipo: 'varios', codigo: 'X1' }, rotulo).texto).toContain(
      'Confira manualmente',
    );
  });
});
