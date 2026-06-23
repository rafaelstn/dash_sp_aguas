import { describe, expect, it } from 'vitest';
import {
  criarHistorico,
  desfazer,
  empilhar,
  podeDesfazer,
  podeRefazer,
  refazer,
} from '@/components/features/diagramas/editor/historico';

/**
 * Histórico undo/redo (Fase A3). Helper puro sobre duas pilhas. Os casos
 * cobrem o ciclo completo: empilhar, desfazer, refazer e o descarte do futuro
 * ao abrir um novo caminho.
 */
describe('historico undo/redo', () => {
  it('começa sem passado nem futuro', () => {
    const h = criarHistorico('a');
    expect(h.presente).toBe('a');
    expect(podeDesfazer(h)).toBe(false);
    expect(podeRefazer(h)).toBe(false);
  });

  it('empilhar move o presente para o passado', () => {
    let h = criarHistorico('a');
    h = empilhar(h, 'b');
    expect(h.presente).toBe('b');
    expect(podeDesfazer(h)).toBe(true);
    expect(h.passado).toEqual(['a']);
  });

  it('não empilha estado idêntico (mesma referência)', () => {
    const valor = { x: 1 };
    let h = criarHistorico(valor);
    h = empilhar(h, valor);
    expect(podeDesfazer(h)).toBe(false);
  });

  it('desfazer e refazer percorrem o histórico', () => {
    let h = criarHistorico('a');
    h = empilhar(h, 'b');
    h = empilhar(h, 'c');

    h = desfazer(h);
    expect(h.presente).toBe('b');
    expect(podeRefazer(h)).toBe(true);

    h = desfazer(h);
    expect(h.presente).toBe('a');
    expect(podeDesfazer(h)).toBe(false);

    h = refazer(h);
    expect(h.presente).toBe('b');
    h = refazer(h);
    expect(h.presente).toBe('c');
    expect(podeRefazer(h)).toBe(false);
  });

  it('desfazer/refazer sem nada disponível é no-op', () => {
    const h = criarHistorico('a');
    expect(desfazer(h)).toBe(h);
    expect(refazer(h)).toBe(h);
  });

  it('empilhar após desfazer limpa o futuro (novo caminho)', () => {
    let h = criarHistorico('a');
    h = empilhar(h, 'b');
    h = empilhar(h, 'c');
    h = desfazer(h); // presente=b, futuro=[c]
    expect(podeRefazer(h)).toBe(true);
    h = empilhar(h, 'd'); // novo caminho
    expect(h.presente).toBe('d');
    expect(podeRefazer(h)).toBe(false);
    expect(h.passado).toEqual(['a', 'b']);
  });

  it('mantém imutabilidade (não muta o histórico de entrada)', () => {
    const h0 = criarHistorico('a');
    const h1 = empilhar(h0, 'b');
    expect(h0.presente).toBe('a');
    expect(h0.passado).toEqual([]);
    expect(h1).not.toBe(h0);
  });
});
