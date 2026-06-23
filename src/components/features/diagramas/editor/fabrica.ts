/**
 * Fábrica de novos elementos do diagrama (Fase A2).
 *
 * Cada `criar*` devolve um elemento já válido pelo `elementosSchema` (zod) que
 * a API exige, com valores neutros de partida. A edição fina (código, valor,
 * limiares) vem na A3; aqui o objetivo é nascer um elemento consistente que o
 * usuário posiciona e nomeia. `id` via `crypto.randomUUID()` (disponível no
 * browser e satisfaz `z.string().min(1)`).
 */

import type {
  ElementoChuva,
  ElementoLinha,
  ElementoNivel,
  ElementoReservatorio,
  Posicao,
} from '@/domain/diagramas/tipos';

function novoId(): string {
  return crypto.randomUUID();
}

export function criarReservatorio(posicao: Posicao): ElementoReservatorio {
  return {
    id: novoId(),
    tipo: 'reservatorio',
    posicao,
    nome: 'Reservatório',
  };
}

export function criarNivel(posicao: Posicao): ElementoNivel {
  return {
    id: novoId(),
    tipo: 'nivel',
    posicao,
    codigo: 'PN-000',
    nome: 'Posto de nível',
    valor: null,
    unidade: 'm',
    limiares: {},
  };
}

export function criarChuva(posicao: Posicao): ElementoChuva {
  return {
    id: novoId(),
    tipo: 'chuva',
    posicao,
    codigo: 'PC-000',
    nome: 'Posto de chuva',
    valor: null,
  };
}

/**
 * Cria um trecho de rio com traçado horizontal padrão a partir do ponto de
 * origem. O traçado fino (mover pontos) chega na A3; aqui nasce reto.
 */
export function criarLinha(posicao: Posicao): ElementoLinha {
  const inicio: Posicao = { x: posicao.x, y: posicao.y };
  const fim: Posicao = { x: posicao.x + 220, y: posicao.y };
  return {
    id: novoId(),
    tipo: 'linha',
    posicao: inicio,
    pontos: [inicio, fim],
    label: 'RIO',
    direcaoSeta: 'direta',
  };
}
