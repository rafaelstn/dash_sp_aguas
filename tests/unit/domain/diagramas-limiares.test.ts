import { describe, expect, it } from 'vitest';
import { validarOrdemLimiares } from '@/domain/diagramas/limiares';

/**
 * Validação da ordem dos limiares (Fase A3).
 *
 * A ordem crescente atencao <= alerta <= emergencia <= extravasamento é o que
 * faz `calcularStatus` ser coerente. Limiares ausentes são ignorados.
 */
describe('validarOrdemLimiares', () => {
  it('aceita limiares vazios', () => {
    expect(validarOrdemLimiares({})).toEqual({ valido: true });
    expect(validarOrdemLimiares(null)).toEqual({ valido: true });
    expect(validarOrdemLimiares(undefined)).toEqual({ valido: true });
  });

  it('aceita ordem crescente completa', () => {
    expect(
      validarOrdemLimiares({
        atencao: 714,
        alerta: 716,
        emergencia: 717.5,
        extravasamento: 718.5,
      }),
    ).toEqual({ valido: true });
  });

  it('aceita iguais (ordem não decrescente)', () => {
    expect(
      validarOrdemLimiares({ atencao: 5, alerta: 5, emergencia: 5 }),
    ).toEqual({ valido: true });
  });

  it('ignora limiares ausentes ao comparar os pares definidos', () => {
    // só atencao e emergencia definidos, em ordem
    expect(
      validarOrdemLimiares({ atencao: 10, emergencia: 20 }),
    ).toEqual({ valido: true });
    // só alerta e extravasamento, fora de ordem
    expect(validarOrdemLimiares({ alerta: 30, extravasamento: 20 }).valido).toBe(
      false,
    );
  });

  it('reprova quando um limiar é maior que o próximo definido', () => {
    const r = validarOrdemLimiares({ atencao: 720, alerta: 716 });
    expect(r.valido).toBe(false);
    expect(r.mensagem).toContain('atenção');
    expect(r.mensagem).toContain('alerta');
  });

  it('reporta a primeira violação na ordem de criticidade', () => {
    const r = validarOrdemLimiares({
      atencao: 1,
      alerta: 9,
      emergencia: 5, // viola contra alerta
      extravasamento: 2, // também violaria, mas alerta>emergencia vem antes
    });
    expect(r.valido).toBe(false);
    expect(r.mensagem).toContain('alerta');
    expect(r.mensagem).toContain('emergência');
  });

  it('trata zero como valor válido (não como ausente)', () => {
    expect(validarOrdemLimiares({ atencao: 0, alerta: -1 }).valido).toBe(false);
    expect(validarOrdemLimiares({ atencao: -5, alerta: 0 }).valido).toBe(true);
  });
});
