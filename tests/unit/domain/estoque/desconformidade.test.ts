import { describe, expect, it } from 'vitest';
import {
  compararDesconformidades,
  DecisaoDesconformidadeInvalida,
  desconformidadeParaDTO,
  montarDecisao,
  type Desconformidade,
} from '@/domain/estoque/desconformidade';

const USUARIO = '11111111-1111-4111-8111-111111111111';
const UNIDADE = '22222222-2222-4222-8222-222222222222';

function base(p: Partial<Desconformidade> = {}): Desconformidade {
  return {
    id: 'a',
    tipo: 'item_sem_descricao',
    origem: 'importacao_planilha',
    aba: 'GERAL PENHA',
    linha: 10,
    detalhe: 'linha sem descrição',
    dados: { codigo: '1SPA26PENHA' },
    status: 'aberta',
    nota: null,
    unidadeId: null,
    resolvidaPor: null,
    resolvidaEm: null,
    detectadaEm: new Date('2026-09-10T12:00:00.000Z'),
    ultimaDeteccaoEm: new Date('2026-09-11T12:00:00.000Z'),
    ...p,
  };
}

describe('montarDecisao', () => {
  it('reabrir limpa nota, unidade e quem decidiu, mesmo se o pedido trouxer', () => {
    expect(montarDecisao({ status: 'aberta', nota: 'qualquer', unidadeId: UNIDADE }, USUARIO)).toEqual({
      status: 'aberta',
      nota: null,
      unidadeId: null,
      resolvidaPor: null,
    });
  });

  it('resolver grava a nota aparada, a unidade e o usuário do auth', () => {
    expect(montarDecisao({ status: 'resolvida', nota: '  cadastrado  ', unidadeId: UNIDADE }, USUARIO)).toEqual({
      status: 'resolvida',
      nota: 'cadastrado',
      unidadeId: UNIDADE,
      resolvidaPor: USUARIO,
    });
  });

  it('ignorar sem unidade grava unidade nula', () => {
    expect(montarDecisao({ status: 'ignorada', nota: 'não é problema' }, USUARIO).unidadeId).toBeNull();
  });

  it('reprova resolver sem nota, com nota vazia ou só de espaços', () => {
    expect(() => montarDecisao({ status: 'resolvida' }, USUARIO)).toThrow(DecisaoDesconformidadeInvalida);
    expect(() => montarDecisao({ status: 'resolvida', nota: '' }, USUARIO)).toThrow(DecisaoDesconformidadeInvalida);
    expect(() => montarDecisao({ status: 'ignorada', nota: '   ab   ' }, USUARIO)).toThrow(
      DecisaoDesconformidadeInvalida,
    );
    expect(() => montarDecisao({ status: 'ignorada', nota: 'x'.repeat(501) }, USUARIO)).toThrow(
      DecisaoDesconformidadeInvalida,
    );
  });

  it('reprova decisão sem usuário', () => {
    expect(() => montarDecisao({ status: 'resolvida', nota: 'ok ok' }, '')).toThrow(DecisaoDesconformidadeInvalida);
  });
});

describe('desconformidadeParaDTO', () => {
  it('datas em ISO e resolvidaEm nula quando aberta', () => {
    const dto = desconformidadeParaDTO(base());
    expect(dto.detectadaEm).toBe('2026-09-10T12:00:00.000Z');
    expect(dto.ultimaDeteccaoEm).toBe('2026-09-11T12:00:00.000Z');
    expect(dto.resolvidaEm).toBeNull();
    expect(dto.dados).toEqual({ codigo: '1SPA26PENHA' });
  });

  it('resolvida carrega a data e só os campos do contrato', () => {
    const dto = desconformidadeParaDTO(
      base({
        status: 'resolvida',
        nota: 'ok ok',
        resolvidaPor: USUARIO,
        resolvidaEm: new Date('2026-09-12T08:30:00.000Z'),
      }),
    );
    expect(dto.resolvidaEm).toBe('2026-09-12T08:30:00.000Z');
    expect(Object.keys(dto).sort()).toEqual(
      [
        'aba', 'dados', 'detalhe', 'detectadaEm', 'id', 'linha', 'nota', 'origem',
        'resolvidaEm', 'resolvidaPor', 'status', 'tipo', 'ultimaDeteccaoEm', 'unidadeId',
      ].sort(),
    );
  });
});

describe('compararDesconformidades', () => {
  it('aberta primeiro, depois tipo, aba (nula no fim) e linha', () => {
    const lista = [
      base({ id: '1', status: 'resolvida', tipo: 'chave_repetida', aba: 'A', linha: 1 }),
      base({ id: '2', tipo: 'quantidade_vazia', aba: 'A', linha: 1 }),
      base({ id: '3', tipo: 'chave_repetida', aba: null, linha: null }),
      base({ id: '4', tipo: 'chave_repetida', aba: 'B', linha: 5 }),
      base({ id: '5', tipo: 'chave_repetida', aba: 'B', linha: 2 }),
    ];
    expect([...lista].sort(compararDesconformidades).map((d) => d.id)).toEqual(['5', '4', '3', '2', '1']);
  });
});
