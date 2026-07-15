import { describe, expect, it } from 'vitest';
import { normalizarLocal, normalizarCampoLocal, montarRotulo } from '@/domain/estoque/local';

describe('domain/estoque/local, normalizacao', () => {
  it('normaliza campo: trim, caixa alta, colapsa espaco', () => {
    expect(normalizarCampoLocal('  sala  2 ')).toBe('SALA 2');
    expect(normalizarCampoLocal('5b')).toBe('5B');
  });

  it('valores sujos viram null', () => {
    for (const v of ['', '   ', '?', '-', 'N/A', null, undefined]) {
      expect(normalizarCampoLocal(v)).toBeNull();
    }
  });

  it('monta rotulo legivel a partir dos campos preenchidos', () => {
    expect(montarRotulo('PENHA', '2', '5B', null)).toBe('PENHA / SALA 2 / PRAT 5B');
    expect(montarRotulo('ARARAQUARA', null, null, null)).toBe('ARARAQUARA');
  });

  it('normalizarLocal produz chave natural estavel (get-or-create nao duplica)', () => {
    const a = normalizarLocal({ unidade: 'PENHA', sala: ' 2 ', prateleira: '5b', armario: '?' });
    const b = normalizarLocal({ unidade: 'PENHA', sala: '2', prateleira: '5B', armario: null });
    expect(a.chave).toBe(b.chave);
    expect(a.chave).toBe('PENHA|2|5B|');
    expect(a.armario).toBeNull();
    expect(a.rotulo).toBe('PENHA / SALA 2 / PRAT 5B');
  });
});
