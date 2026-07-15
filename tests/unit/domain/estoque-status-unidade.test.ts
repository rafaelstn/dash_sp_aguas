import { describe, expect, it } from 'vitest';
import { transicaoValida, ehStatusValido, STATUS } from '@/domain/estoque/status-unidade';

describe('domain/estoque/status-unidade, maquina de estados', () => {
  it('permite as transicoes validas do fluxo normal', () => {
    expect(transicaoValida('ativo', 'defeito')).toBe(true);
    expect(transicaoValida('ativo', 'descarte')).toBe(true);
    expect(transicaoValida('defeito', 'ativo')).toBe(true);
    expect(transicaoValida('defeito', 'descarte')).toBe(true);
  });

  it('descarte e terminal no fluxo normal', () => {
    expect(transicaoValida('descarte', 'ativo')).toBe(false);
    expect(transicaoValida('descarte', 'defeito')).toBe(false);
  });

  it('transicao para o mesmo status nao conta como transicao', () => {
    for (const s of STATUS) {
      expect(transicaoValida(s, s)).toBe(false);
    }
  });

  it('ehStatusValido reconhece so os tres status', () => {
    expect(ehStatusValido('ativo')).toBe(true);
    expect(ehStatusValido('defeito')).toBe(true);
    expect(ehStatusValido('descarte')).toBe(true);
    expect(ehStatusValido('sumido')).toBe(false);
    expect(ehStatusValido(undefined)).toBe(false);
  });
});
