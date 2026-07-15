import { describe, it, expect } from 'vitest';
import {
  calcularEstatisticasNivel,
  fmtMetros,
  ROTULO_GRANDEZA_NIVEL,
} from '@/components/features/monitor/estatisticas-nivel';
import type { PontoNivel } from '@/components/features/monitor/tipos-nivel';

function ponto(
  momento: string,
  medio: number,
  min: number,
  max: number,
): PontoNivel {
  return { momento, nivelMedioM: medio, nivelMinM: min, nivelMaxM: max };
}

describe('fmtMetros', () => {
  it('formata com 2 casas e sufixo m no padrão pt-BR', () => {
    expect(fmtMetros(1.2)).toBe('1,20 m');
    expect(fmtMetros(0)).toBe('0,00 m');
    expect(fmtMetros(1234.5)).toBe('1.234,50 m');
  });

  it('arredonda para 2 casas', () => {
    expect(fmtMetros(1.235)).toBe('1,24 m');
    expect(fmtMetros(1.234)).toBe('1,23 m');
  });
});

describe('calcularEstatisticasNivel', () => {
  it('devolve zeros e ultima null para série vazia', () => {
    expect(calcularEstatisticasNivel([])).toEqual({
      medioM: 0,
      minimoM: 0,
      maximoM: 0,
      ultima: null,
    });
  });

  it('média dos médios, mínimo dos mínimos e máximo dos máximos', () => {
    const itens = [
      ponto('2026-07-01T00:00:00Z', 2.0, 1.8, 2.2),
      ponto('2026-07-02T00:00:00Z', 3.0, 2.5, 3.4),
      ponto('2026-07-03T00:00:00Z', 4.0, 3.9, 4.6),
    ];
    const est = calcularEstatisticasNivel(itens);
    expect(est.medioM).toBe(3.0); // (2+3+4)/3
    expect(est.minimoM).toBe(1.8); // menor dos mínimos
    expect(est.maximoM).toBe(4.6); // maior dos máximos
  });

  it('usa o último item da série (crescente) como última leitura', () => {
    const itens = [
      ponto('2026-07-01T00:00:00Z', 2.0, 1.8, 2.2),
      ponto('2026-07-05T00:00:00Z', 5.5, 5.0, 6.0),
    ];
    const est = calcularEstatisticasNivel(itens);
    expect(est.ultima).toEqual({
      momento: '2026-07-05T00:00:00Z',
      nivelMedioM: 5.5,
    });
  });

  it('trata níveis negativos (piezômetro abaixo do referencial)', () => {
    const itens = [
      ponto('2026-07-01T00:00:00Z', -1.5, -1.8, -1.2),
      ponto('2026-07-02T00:00:00Z', -0.5, -0.7, -0.3),
    ];
    const est = calcularEstatisticasNivel(itens);
    expect(est.medioM).toBe(-1.0);
    expect(est.minimoM).toBe(-1.8);
    expect(est.maximoM).toBe(-0.3);
  });
});

describe('ROTULO_GRANDEZA_NIVEL', () => {
  it('descreve a grandeza por tipo hidrológico', () => {
    expect(ROTULO_GRANDEZA_NIVEL.fluviometrico.titulo).toBe('Nível do rio');
    expect(ROTULO_GRANDEZA_NIVEL.piezometrico.titulo).toBe(
      'Nível de água subterrânea',
    );
  });
});
