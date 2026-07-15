import { describe, expect, it } from 'vitest';
import { mapearEstado, ehEstadoValido } from '@/domain/estoque/estado';

describe('domain/estoque/estado, mapearEstado (de-para)', () => {
  it('mapeia variacoes de NOVO', () => {
    for (const t of ['NOVO', 'nova', 'Na Caixa', 'LACRADO', 'vedado']) {
      expect(mapearEstado(t)).toBe('novo');
    }
  });

  it('mapeia variacoes de BOM', () => {
    for (const t of ['BOA', 'bom', 'OK', 'Perfeito', 'otimo']) {
      expect(mapearEstado(t)).toBe('bom');
    }
  });

  it('mapeia variacoes de USADO', () => {
    for (const t of ['USADO', 'usada', 'Regular', 'duvidoso']) {
      expect(mapearEstado(t)).toBe('usado');
    }
  });

  it('mapeia variacoes de DEFEITO e da precedencia sobre BOM', () => {
    for (const t of ['COM DEFEITO', 'defeito', 'com problema', 'QUEIMADO', 'nao funciona']) {
      expect(mapearEstado(t)).toBe('defeito');
    }
    // "com defeito" contem "bom"? nao, mas garante precedencia de frase.
    expect(mapearEstado('aparelho com defeito, nao liga')).toBe('defeito');
  });

  it('mapeia variacoes de SUCATA com maior precedencia', () => {
    for (const t of ['SUCATA', 'inservivel', 'IMPRESTAVEL']) {
      expect(mapearEstado(t)).toBe('sucata');
    }
  });

  it('preserva null para vazio, "?", sem correspondencia', () => {
    expect(mapearEstado(null)).toBeNull();
    expect(mapearEstado(undefined)).toBeNull();
    expect(mapearEstado('')).toBeNull();
    expect(mapearEstado('   ')).toBeNull();
    expect(mapearEstado('?')).toBeNull();
    expect(mapearEstado('xyz aleatorio 123')).toBeNull();
  });

  it('e insensivel a acento e caixa', () => {
    expect(mapearEstado('ótimo')).toBe('bom');
    expect(mapearEstado('inservível')).toBe('sucata');
  });

  it('ehEstadoValido reconhece so os cinco estados', () => {
    for (const e of ['novo', 'bom', 'usado', 'defeito', 'sucata']) {
      expect(ehEstadoValido(e)).toBe(true);
    }
    expect(ehEstadoValido('quebrado')).toBe(false);
    expect(ehEstadoValido(null)).toBe(false);
  });
});
