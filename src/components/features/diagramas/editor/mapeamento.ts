/**
 * Mapeamento puro entre elementos do domínio e nodes do React Flow.
 *
 * Toda a regra de conversão vive aqui, sem React e sem I/O, para ser testável
 * em isolamento (tests/unit/domain). O editor client só orquestra: carrega os
 * elementos, chama `elementosParaNodes` para renderizar e `nodesParaElementos`
 * para reconstruir o array que vai pro auto-save (PATCH), preservando a ordem.
 *
 * Decisão (rio = node, não edge): os elementos do domínio não têm relação
 * source/target entre si; o trecho de rio é definido pelos próprios `pontos[]`.
 * Modelá-lo como edge exigiria nodes-âncora artificiais. Então o rio também é
 * um custom node cujo SVG é desenhado a partir de `pontos[]`. A `position` do
 * node-rio fica em (0,0) e os pontos são absolutos no canvas — o custom node
 * renderiza a faixa sem depender de transform do React Flow. Mover o traçado
 * fino do rio vem na A3; nesta fase o rio nasce com um traçado padrão e é
 * selecionável/excluível como qualquer elemento.
 */

import type { ElementoDiagrama } from '@/domain/diagramas/tipos';
import type { NodeDiagrama } from './tipos-editor';

/**
 * Converte um elemento do domínio no node correspondente do React Flow.
 * `position` vem de `posicao{x,y}`; o elemento inteiro vai no `data` para o
 * custom node consumir. O rio fica em (0,0) pois desenha por coordenadas
 * absolutas (`pontos[]`); os demais usam a própria posição.
 */
export function elementoParaNode(elemento: ElementoDiagrama): NodeDiagrama {
  const base = {
    id: elemento.id,
    selectable: true,
  };

  if (elemento.tipo === 'linha') {
    return {
      ...base,
      type: 'linha',
      position: { x: 0, y: 0 },
      draggable: false,
      data: { elemento },
    };
  }

  return {
    ...base,
    type: elemento.tipo,
    position: { x: elemento.posicao.x, y: elemento.posicao.y },
    draggable: true,
    data: { elemento },
  } as NodeDiagrama;
}

/** Converte a lista de elementos nos nodes do editor (ordem preservada). */
export function elementosParaNodes(
  elementos: ElementoDiagrama[],
): NodeDiagrama[] {
  return elementos.map(elementoParaNode);
}

/**
 * Reconstrói o elemento de domínio a partir de um node, aplicando a posição
 * atual do node (que muda quando o usuário arrasta). Para o rio, a posição
 * vive nos `pontos[]`, então o node fica em (0,0) e o elemento é devolvido tal
 * qual — o deslocamento do traçado é tratado na A3.
 */
export function nodeParaElemento(node: NodeDiagrama): ElementoDiagrama {
  const { elemento } = node.data;

  if (elemento.tipo === 'linha') {
    return elemento;
  }

  return {
    ...elemento,
    posicao: {
      x: Math.round(node.position.x),
      y: Math.round(node.position.y),
    },
  };
}

/** Reconstrói o array de elementos a partir dos nodes (para o auto-save). */
export function nodesParaElementos(nodes: NodeDiagrama[]): ElementoDiagrama[] {
  return nodes.map(nodeParaElemento);
}
