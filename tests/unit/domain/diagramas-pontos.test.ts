import { describe, expect, it } from 'vitest';
import {
  inserirPonto,
  moverPonto,
  removerPonto,
} from '@/domain/diagramas/pontos';
import type { Posicao } from '@/domain/diagramas/tipos';

/**
 * Operações puras sobre o traçado do rio (Fase A3): mover, inserir e remover
 * vértices, preservando o invariante de 2+ pontos.
 */
const tracado: Posicao[] = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 200, y: 0 },
];

describe('moverPonto', () => {
  it('move o vértice e arredonda a inteiro', () => {
    const r = moverPonto(tracado, 1, { x: 150.6, y: 20.2 });
    expect(r[1]).toEqual({ x: 151, y: 20 });
    expect(r[0]).toEqual({ x: 0, y: 0 });
  });

  it('índice inválido devolve o array inalterado', () => {
    expect(moverPonto(tracado, 9, { x: 1, y: 1 })).toBe(tracado);
    expect(moverPonto(tracado, -1, { x: 1, y: 1 })).toBe(tracado);
  });

  it('não muta o array de entrada', () => {
    moverPonto(tracado, 0, { x: 5, y: 5 });
    expect(tracado[0]).toEqual({ x: 0, y: 0 });
  });
});

describe('inserirPonto', () => {
  it('insere no ponto médio do segmento quando não há destino', () => {
    const r = inserirPonto(tracado, 0);
    expect(r).toHaveLength(4);
    expect(r[1]).toEqual({ x: 50, y: 0 });
  });

  it('insere na posição informada (arredondada)', () => {
    const r = inserirPonto(tracado, 1, { x: 150.9, y: 30.1 });
    expect(r).toHaveLength(4);
    expect(r[2]).toEqual({ x: 151, y: 30 });
  });

  it('segmento inválido devolve inalterado', () => {
    expect(inserirPonto(tracado, 2)).toBe(tracado); // último ponto não inicia segmento
    expect(inserirPonto(tracado, -1)).toBe(tracado);
  });
});

describe('removerPonto', () => {
  it('remove o vértice quando sobram 2+ pontos', () => {
    const r = removerPonto(tracado, 1);
    expect(r).toEqual([
      { x: 0, y: 0 },
      { x: 200, y: 0 },
    ]);
  });

  it('recusa remover se sobrariam menos de 2 pontos', () => {
    const dois: Posicao[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    expect(removerPonto(dois, 0)).toBe(dois);
  });

  it('índice inválido devolve inalterado', () => {
    expect(removerPonto(tracado, 9)).toBe(tracado);
  });
});
