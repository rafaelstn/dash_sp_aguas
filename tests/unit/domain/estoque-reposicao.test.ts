import { describe, expect, it } from 'vitest';
import { abaixoDoMinimo } from '@/domain/estoque/reposicao';

describe('domain/estoque/reposicao, abaixoDoMinimo', () => {
  it('minima nula nunca dispara (sem minimo definido)', () => {
    expect(abaixoDoMinimo(0, null)).toBe(false);
    expect(abaixoDoMinimo(999, null)).toBe(false);
  });

  it('saldo igual ao minimo NAO esta abaixo (minimo e o piso aceitavel)', () => {
    expect(abaixoDoMinimo(10, 10)).toBe(false);
  });

  it('saldo menor que o minimo esta abaixo', () => {
    expect(abaixoDoMinimo(9, 10)).toBe(true);
    expect(abaixoDoMinimo(0, 1)).toBe(true);
  });

  it('saldo maior que o minimo nao esta abaixo', () => {
    expect(abaixoDoMinimo(11, 10)).toBe(false);
  });

  it('minimo zero nunca dispara (saldo nao pode ser negativo)', () => {
    expect(abaixoDoMinimo(0, 0)).toBe(false);
    expect(abaixoDoMinimo(5, 0)).toBe(false);
  });
});
