import 'server-only';
import type { Categoria } from '@/domain/estoque/categoria';
import type { Local } from '@/domain/estoque/local';
import type { Material } from '@/domain/estoque/material';
import type { Unidade } from '@/domain/estoque/unidade';
import type { Saldo } from '@/domain/estoque/saldo';
import type { Movimentacao } from '@/domain/estoque/movimentacao';

/**
 * Store in-memory COMPARTILHADO pelos mocks do modulo de estoque (MODO DEMO e
 * testes de use-case). No mundo `.pg` os repositorios convergem no mesmo banco;
 * no mundo mock precisam convergir no mesmo estado — senao a movimentacao (que
 * le unidade/material e escreve saldo/unidade) nao enxergaria os demais repos.
 *
 * Estado por processo; perde tudo ao reiniciar. `_resetEstoqueMock` zera entre
 * testes (segue o padrao `_resetTriagemMock`).
 */
export const estoqueStore = {
  categorias: new Map<string, Categoria>(),
  locais: new Map<string, Local>(),
  materiais: new Map<string, Material>(),
  unidades: new Map<string, Unidade>(),
  /** Chave: `${materialId}|${localId}|${tamanho ?? ''}`. */
  saldos: new Map<string, Saldo>(),
  movimentacoes: [] as Movimentacao[],
};

export function chaveSaldoMock(
  materialId: string,
  localId: string,
  tamanho: string | null,
): string {
  return `${materialId}|${localId}|${tamanho ?? ''}`;
}

export function _resetEstoqueMock(): void {
  estoqueStore.categorias.clear();
  estoqueStore.locais.clear();
  estoqueStore.materiais.clear();
  estoqueStore.unidades.clear();
  estoqueStore.saldos.clear();
  estoqueStore.movimentacoes = [];
}
