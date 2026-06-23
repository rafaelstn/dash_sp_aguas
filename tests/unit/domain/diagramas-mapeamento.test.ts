import { describe, expect, it } from 'vitest';
import {
  elementoParaNode,
  elementosParaNodes,
  nodeParaElemento,
  nodesParaElementos,
} from '@/components/features/diagramas/editor/mapeamento';
import type {
  ElementoChuva,
  ElementoLinha,
  ElementoNivel,
  ElementoReservatorio,
} from '@/domain/diagramas/tipos';
import type { NodeNivel } from '@/components/features/diagramas/editor/tipos-editor';

/**
 * Mapeamento elemento <-> node do React Flow (Fase A2).
 *
 * Garante o ida-e-volta: o array salvo no banco bate com o que o editor
 * carregou, exceto pela posição que reflete o arrasto do usuário. O ciclo
 * precisa fechar para o auto-save (PATCH) não corromper o diagrama.
 */

const reservatorio: ElementoReservatorio = {
  id: 'r1',
  tipo: 'reservatorio',
  posicao: { x: 100, y: 200 },
  nome: 'Represa Jaguari',
};

const nivel: ElementoNivel = {
  id: 'n1',
  tipo: 'nivel',
  posicao: { x: 300, y: 120 },
  codigo: 'PN-001',
  nome: 'Posto Jaguari',
  valor: 713.669,
  unidade: 'm',
  limiares: { atencao: 714, alerta: 716, emergencia: 717.5, extravasamento: 718.5 },
};

const chuva: ElementoChuva = {
  id: 'c1',
  tipo: 'chuva',
  posicao: { x: 500, y: 80 },
  codigo: 'PC-002',
  nome: 'Pluviômetro Norte',
  valor: 12.5,
};

const linha: ElementoLinha = {
  id: 'l1',
  tipo: 'linha',
  posicao: { x: 0, y: 300 },
  pontos: [
    { x: 0, y: 300 },
    { x: 400, y: 300 },
  ],
  label: 'RIO TIETE',
  direcaoSeta: 'direta',
};

describe('elementoParaNode', () => {
  it('mapeia posicao do elemento para position do node', () => {
    const node = elementoParaNode(reservatorio);
    expect(node.type).toBe('reservatorio');
    expect(node.position).toEqual({ x: 100, y: 200 });
    expect(node.data.elemento).toBe(reservatorio);
    expect(node.draggable).toBe(true);
  });

  it('rio fica em (0,0), nao arrastavel, e carrega o elemento no data', () => {
    const node = elementoParaNode(linha);
    expect(node.type).toBe('linha');
    expect(node.position).toEqual({ x: 0, y: 0 });
    expect(node.draggable).toBe(false);
    expect(node.data.elemento).toBe(linha);
  });

  it('preserva o id do elemento como id do node', () => {
    expect(elementoParaNode(nivel).id).toBe('n1');
    expect(elementoParaNode(chuva).id).toBe('c1');
  });
});

describe('nodeParaElemento', () => {
  it('reflete a posicao atual do node arrastado no elemento', () => {
    const node = elementoParaNode(nivel) as NodeNivel;
    const arrastado: NodeNivel = { ...node, position: { x: 333, y: 444 } };
    const elemento = nodeParaElemento(arrastado);
    expect(elemento.tipo).toBe('nivel');
    expect(elemento.posicao).toEqual({ x: 333, y: 444 });
  });

  it('arredonda a posicao para inteiro', () => {
    const node = elementoParaNode(chuva);
    const arrastado = { ...node, position: { x: 10.7, y: 20.2 } };
    expect(nodeParaElemento(arrastado).posicao).toEqual({ x: 11, y: 20 });
  });

  it('rio e devolvido sem alterar a posicao (traçado vive nos pontos)', () => {
    const node = elementoParaNode(linha);
    const elemento = nodeParaElemento(node);
    expect(elemento).toBe(linha);
  });
});

describe('ida e volta (round-trip)', () => {
  it('sem arrasto, o array reconstruido bate com o original', () => {
    const elementos = [reservatorio, nivel, chuva, linha];
    const nodes = elementosParaNodes(elementos);
    const reconstruido = nodesParaElementos(nodes);
    expect(reconstruido).toEqual(elementos);
  });

  it('preserva a ordem dos elementos', () => {
    const elementos = [chuva, reservatorio, nivel];
    const ids = nodesParaElementos(elementosParaNodes(elementos)).map((e) => e.id);
    expect(ids).toEqual(['c1', 'r1', 'n1']);
  });
});
