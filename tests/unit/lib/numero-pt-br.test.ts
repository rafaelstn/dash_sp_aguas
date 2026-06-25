import { describe, it, expect } from 'vitest';
import {
  parseNumeroPtBR,
  parseNumeroPtBROuNull,
  numeroPtBRParaTexto,
} from '@/lib/numero-pt-br';

describe('parseNumeroPtBR', () => {
  it('interpreta vírgula como separador decimal e ponto como milhar', () => {
    expect(parseNumeroPtBR('1.234,56')).toBe(1234.56);
    expect(parseNumeroPtBR('1234,56')).toBe(1234.56);
    expect(parseNumeroPtBR('0,5')).toBe(0.5);
  });

  it('aceita ponto como decimal quando não há vírgula', () => {
    expect(parseNumeroPtBR('1234.56')).toBe(1234.56);
    expect(parseNumeroPtBR('1.5')).toBe(1.5);
    expect(parseNumeroPtBR('42')).toBe(42);
  });

  it('retorna NaN para vazio ou não numérico', () => {
    expect(parseNumeroPtBR('')).toBeNaN();
    expect(parseNumeroPtBR('   ')).toBeNaN();
    expect(parseNumeroPtBR('abc')).toBeNaN();
  });
});

describe('parseNumeroPtBROuNull', () => {
  it('devolve null para vazio/inválido e número quando válido', () => {
    expect(parseNumeroPtBROuNull('')).toBeNull();
    expect(parseNumeroPtBROuNull('abc')).toBeNull();
    expect(parseNumeroPtBROuNull('2,5')).toBe(2.5);
  });
});

describe('numeroPtBRParaTexto', () => {
  it('troca o ponto decimal por vírgula', () => {
    expect(numeroPtBRParaTexto(1.5)).toBe('1,5');
    expect(numeroPtBRParaTexto(42)).toBe('42');
  });

  it('faz ida e volta com parseNumeroPtBR', () => {
    expect(parseNumeroPtBR(numeroPtBRParaTexto(3.14))).toBe(3.14);
  });
});
