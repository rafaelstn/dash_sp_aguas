import { describe, expect, it } from 'vitest';
import {
  calcularDelta,
  rotuloDelta,
  sparklinePath,
} from '@/lib/delta';

describe('calcularDelta', () => {
  it('detecta aumento com percentual positivo', () => {
    const d = calcularDelta(120, 100);
    expect(d.direcao).toBe('subiu');
    expect(d.absoluto).toBe(20);
    expect(d.percentual).toBeCloseTo(20);
  });

  it('detecta redução com percentual negativo', () => {
    const d = calcularDelta(80, 100);
    expect(d.direcao).toBe('caiu');
    expect(d.absoluto).toBe(-20);
    expect(d.percentual).toBeCloseTo(-20);
  });

  it('marca estável quando não há variação', () => {
    const d = calcularDelta(100, 100);
    expect(d.direcao).toBe('estavel');
    expect(d.absoluto).toBe(0);
    expect(d.percentual).toBe(0);
  });

  it('retorna percentual nulo quando o anterior é zero', () => {
    const d = calcularDelta(10, 0);
    expect(d.direcao).toBe('subiu');
    expect(d.absoluto).toBe(10);
    expect(d.percentual).toBeNull();
  });

  it('usa valor absoluto da base para não inverter sinal com base negativa', () => {
    const d = calcularDelta(-5, -10);
    expect(d.direcao).toBe('subiu');
    // (-5 - (-10)) / |−10| = 5 / 10 = 50%
    expect(d.percentual).toBeCloseTo(50);
  });
});

describe('rotuloDelta', () => {
  it('descreve a direção em palavras (não só cor) para a11y', () => {
    expect(rotuloDelta(calcularDelta(120, 100))).toMatch(/aumento/i);
    expect(rotuloDelta(calcularDelta(80, 100))).toMatch(/redução/i);
    expect(rotuloDelta(calcularDelta(100, 100))).toBe('Sem variação');
  });

  it('cita ausência de base quando o anterior é zero', () => {
    expect(rotuloDelta(calcularDelta(10, 0))).toMatch(/sem base anterior/i);
  });
});

describe('sparklinePath', () => {
  it('retorna vazio com menos de 2 pontos', () => {
    expect(sparklinePath([], 100, 28)).toBe('');
    expect(sparklinePath([5], 100, 28)).toBe('');
  });

  it('gera um path que começa com move e contém line-to', () => {
    const d = sparklinePath([0, 5, 10], 100, 28);
    expect(d.startsWith('M')).toBe(true);
    expect(d).toContain('L');
    // 3 pontos => 1 M + 2 L
    expect(d.match(/L/g)?.length).toBe(2);
  });

  it('coloca o maior valor no topo (y menor) e o menor na base', () => {
    const d = sparklinePath([0, 10], 100, 28);
    // Primeiro ponto (valor 0, mínimo) deve estar na base (y = 28).
    expect(d).toContain('M0.00,28.00');
    // Segundo ponto (valor 10, máximo) no topo (y = 0).
    expect(d).toContain('L100.00,0.00');
  });

  it('não quebra quando todos os valores são iguais (amplitude zero)', () => {
    const d = sparklinePath([7, 7, 7], 100, 28);
    expect(d).not.toContain('NaN');
  });
});
