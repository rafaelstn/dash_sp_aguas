import { describe, expect, it } from 'vitest';
import {
  calcularStatus,
  STATUS_COLORS,
  type LimiaresNivel,
} from '@/domain/diagramas/tipos';

/**
 * Testes do domínio de status dos diagramas unifilares.
 *
 * Regra: avalia do mais crítico ao menos crítico; o primeiro limiar definido
 * que o valor alcança (>=) vence. Limiares ausentes são ignorados; valor
 * ausente devolve `normal`.
 */

const limiares: LimiaresNivel = {
  atencao: 2,
  alerta: 4,
  emergencia: 6,
  extravasamento: 8,
};

describe('domínio/diagramas — calcularStatus (5 níveis de limiar)', () => {
  it('abaixo de todos os limiares é normal', () => {
    expect(calcularStatus(1.9, limiares)).toBe('normal');
  });

  it('no piso de atenção é atencao', () => {
    expect(calcularStatus(2, limiares)).toBe('atencao');
    expect(calcularStatus(3.9, limiares)).toBe('atencao');
  });

  it('no piso de alerta é alerta', () => {
    expect(calcularStatus(4, limiares)).toBe('alerta');
    expect(calcularStatus(5.9, limiares)).toBe('alerta');
  });

  it('no piso de emergência é emergencia', () => {
    expect(calcularStatus(6, limiares)).toBe('emergencia');
    expect(calcularStatus(7.9, limiares)).toBe('emergencia');
  });

  it('no piso de extravasamento é extravasamento', () => {
    expect(calcularStatus(8, limiares)).toBe('extravasamento');
    expect(calcularStatus(100, limiares)).toBe('extravasamento');
  });

  it('valor nulo ou indefinido é normal (sem leitura, sem alarme)', () => {
    expect(calcularStatus(null, limiares)).toBe('normal');
    expect(calcularStatus(undefined, limiares)).toBe('normal');
  });

  it('limiares ausentes são ignorados (pula níveis sem piso)', () => {
    const parcial: LimiaresNivel = { atencao: 2, emergencia: 6 };
    expect(calcularStatus(5, parcial)).toBe('atencao');
    expect(calcularStatus(6, parcial)).toBe('emergencia');
  });

  it('sem limiares configurados é sempre normal', () => {
    expect(calcularStatus(999, {})).toBe('normal');
    expect(calcularStatus(999, null)).toBe('normal');
  });

  it('expõe cor para cada um dos 5 status', () => {
    const status = [
      'normal',
      'atencao',
      'alerta',
      'emergencia',
      'extravasamento',
    ] as const;
    for (const s of status) {
      expect(STATUS_COLORS[s]).toBeTruthy();
    }
  });
});
