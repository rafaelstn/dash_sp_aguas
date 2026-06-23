/**
 * Agregado Diagrama Unifilar.
 *
 * Um diagrama é um esquema da rede hidrológica: nome, bacia opcional e um
 * array de `elementos` (os 4 tipos em `tipos.ts`). Os elementos são guardados
 * como JSONB; o backend persiste o array tal como o editor entrega.
 */

import type { ElementoDiagrama } from './tipos';

/** Diagrama completo, com os elementos (JSONB pesado). */
export interface Diagrama {
  id: string;
  nome: string;
  bacia: string | null;
  descricao: string | null;
  elementos: ElementoDiagrama[];
  criadoPor: string | null;
  criadoEm: Date;
  atualizadoEm: Date;
}

/**
 * Resumo para listagem: sem o array de elementos (evita trafegar JSONB pesado
 * numa tela de lista). Usado pela página `/diagramas`.
 */
export interface DiagramaResumo {
  id: string;
  nome: string;
  bacia: string | null;
  atualizadoEm: Date;
}

/** Dados aceitos na criação de um diagrama. */
export interface NovoDiagrama {
  nome: string;
  bacia?: string | null;
  descricao?: string | null;
  elementos?: ElementoDiagrama[];
}
