/**
 * Tipos do editor visual de diagramas (Fase A2).
 *
 * O React Flow trabalha com `Node`/`Edge` genéricos; aqui fixamos o `data` de
 * cada node como o próprio elemento do domínio. Assim o custom node recebe o
 * elemento inteiro tipado e o mapeamento de volta (node -> elemento) é trivial.
 *
 * Mantido sem `'use client'`: é só tipo + união, consumido tanto pelo editor
 * client quanto pelo helper puro de mapeamento (testado em isolamento).
 */

import type { Node } from '@xyflow/react';
import type {
  ElementoChuva,
  ElementoLinha,
  ElementoNivel,
  ElementoReservatorio,
} from '@/domain/diagramas/tipos';

/** Ferramenta ativa na toolbar. */
export type Ferramenta =
  | 'selecionar'
  | 'reservatorio'
  | 'nivel'
  | 'chuva'
  | 'linha';

/** Cada tipo de node carrega o elemento de domínio correspondente em `data`. */
export type NodeReservatorio = Node<{ elemento: ElementoReservatorio }, 'reservatorio'>;
export type NodeNivel = Node<{ elemento: ElementoNivel }, 'nivel'>;
export type NodeChuva = Node<{ elemento: ElementoChuva }, 'chuva'>;
export type NodeLinha = Node<{ elemento: ElementoLinha }, 'linha'>;

/** União dos nodes do editor. */
export type NodeDiagrama = NodeReservatorio | NodeNivel | NodeChuva | NodeLinha;
