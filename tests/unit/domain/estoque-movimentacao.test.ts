import { describe, expect, it } from 'vitest';
import {
  resolverAlvo,
  validarComandoEstrutural,
  type AlvoMovimentacao,
} from '@/domain/estoque/movimentacao';
import { AlvoMovimentacaoInvalido, MovimentacaoInvalida } from '@/domain/errors';

const U = '11111111-1111-1111-1111-111111111111';
const M = '22222222-2222-2222-2222-222222222222';
const L1 = '33333333-3333-3333-3333-333333333333';
const L2 = '44444444-4444-4444-4444-444444444444';

const alvoSerial: AlvoMovimentacao = { natureza: 'serializado', unidadeId: U };
const alvoQuant: AlvoMovimentacao = { natureza: 'quantificavel', materialId: M };

describe('domain/estoque/movimentacao, resolverAlvo (XOR)', () => {
  it('unidadeId -> serializado', () => {
    expect(resolverAlvo({ unidadeId: U })).toEqual(alvoSerial);
  });
  it('materialId -> quantificavel', () => {
    expect(resolverAlvo({ materialId: M })).toEqual(alvoQuant);
  });
  it('nenhum alvo lanca', () => {
    expect(() => resolverAlvo({})).toThrow(AlvoMovimentacaoInvalido);
  });
  it('ambos os alvos lanca', () => {
    expect(() => resolverAlvo({ unidadeId: U, materialId: M })).toThrow(AlvoMovimentacaoInvalido);
  });
});

describe('domain/estoque/movimentacao, validarComandoEstrutural', () => {
  const base = { quantidade: 1, localOrigemId: null, localDestinoId: null, tamanho: null, motivo: null };

  it('entrada exige localDestino', () => {
    expect(() =>
      validarComandoEstrutural({ ...base, tipo: 'entrada', alvo: alvoQuant }),
    ).toThrow(MovimentacaoInvalida);
    expect(() =>
      validarComandoEstrutural({ ...base, tipo: 'entrada', alvo: alvoQuant, localDestinoId: L1 }),
    ).not.toThrow();
  });

  it('saida exige localOrigem', () => {
    expect(() =>
      validarComandoEstrutural({ ...base, tipo: 'saida', alvo: alvoQuant }),
    ).toThrow(MovimentacaoInvalida);
    expect(() =>
      validarComandoEstrutural({ ...base, tipo: 'saida', alvo: alvoQuant, localOrigemId: L1 }),
    ).not.toThrow();
  });

  it('transferencia exige origem e destino distintos', () => {
    expect(() =>
      validarComandoEstrutural({ ...base, tipo: 'transferencia', alvo: alvoQuant, localOrigemId: L1, localDestinoId: L1 }),
    ).toThrow(MovimentacaoInvalida);
    expect(() =>
      validarComandoEstrutural({ ...base, tipo: 'transferencia', alvo: alvoQuant, localOrigemId: L1, localDestinoId: L2 }),
    ).not.toThrow();
  });

  it('baixa exige motivo; quantificavel exige localOrigem', () => {
    expect(() =>
      validarComandoEstrutural({ ...base, tipo: 'baixa', alvo: alvoQuant, localOrigemId: L1 }),
    ).toThrow(/motivo/);
    expect(() =>
      validarComandoEstrutural({ ...base, tipo: 'baixa', alvo: alvoQuant, motivo: 'quebrou' }),
    ).toThrow(/localOrigem/);
    expect(() =>
      validarComandoEstrutural({ ...base, tipo: 'baixa', alvo: alvoQuant, motivo: 'quebrou', localOrigemId: L1 }),
    ).not.toThrow();
  });

  it('serializado tem quantidade 1', () => {
    expect(() =>
      validarComandoEstrutural({ ...base, tipo: 'entrada', alvo: alvoSerial, localDestinoId: L1, quantidade: 2 }),
    ).toThrow(/quantidade 1/);
  });

  it('ajuste so serializado, exige motivo e ao menos uma mudanca', () => {
    // quantificavel + ajuste = barrado
    expect(() =>
      validarComandoEstrutural({ ...base, tipo: 'ajuste', alvo: alvoQuant, motivo: 'corrigir' }),
    ).toThrow(/serializados/);
    // serializado sem mudanca
    expect(() =>
      validarComandoEstrutural({ ...base, tipo: 'ajuste', alvo: alvoSerial, motivo: 'corrigir' }),
    ).toThrow(/ao menos uma mudanca/);
    // serializado com status
    expect(() =>
      validarComandoEstrutural({ ...base, tipo: 'ajuste', alvo: alvoSerial, motivo: 'corrigir', novoStatus: 'ativo' }),
    ).not.toThrow();
  });
});
