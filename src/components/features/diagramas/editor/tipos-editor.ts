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
  Posicao,
} from '@/domain/diagramas/tipos';

/** Ferramenta ativa na toolbar. */
export type Ferramenta =
  | 'selecionar'
  | 'reservatorio'
  | 'nivel'
  | 'chuva'
  | 'linha';

/**
 * Callbacks que o node-rio usa para editar o traçado (Fase A3). Ficam no `data`
 * do node para o custom node manipular os `pontos[]` sem acoplar ao editor.
 * Opcionais: o mapeamento puro não os conhece (são injetados pelo editor ao
 * renderizar). `persistir=false` durante o arrasto, `true` ao soltar.
 */
export interface AcoesLinha {
  /** Move um vértice do traçado para uma nova posição (canvas). */
  moverPonto: (id: string, indice: number, ponto: Posicao, persistir: boolean) => void;
  /** Insere um vértice após o índice dado (duplo clique no segmento). */
  inserirPonto: (id: string, indiceSegmento: number, ponto: Posicao) => void;
  /** Remove o vértice no índice dado (mínimo 2 pontos preservado). */
  removerPonto: (id: string, indice: number) => void;
}

/** Cada tipo de node carrega o elemento de domínio correspondente em `data`. */
export type NodeReservatorio = Node<{ elemento: ElementoReservatorio }, 'reservatorio'>;
export type NodeNivel = Node<{ elemento: ElementoNivel }, 'nivel'>;
export type NodeChuva = Node<{ elemento: ElementoChuva }, 'chuva'>;
export type NodeLinha = Node<
  { elemento: ElementoLinha; acoes?: AcoesLinha },
  'linha'
>;

/** União dos nodes do editor. */
export type NodeDiagrama = NodeReservatorio | NodeNivel | NodeChuva | NodeLinha;
