import 'server-only';
import { randomUUID } from 'node:crypto';
import type { EstoqueCategoriasRepository } from '@/application/ports/estoque-categorias-repository';
import { CategoriaDuplicada, CategoriaNaoEncontrada } from '@/domain/errors';
import { estoqueStore } from './estoque-store.mock';

/** Espelha `uq_estoque_categorias_nome`: `lower(nome)`. */
function garantirNomeLivre(nome: string, ignorarId?: string): void {
  const alvo = nome.toLowerCase();
  for (const c of estoqueStore.categorias.values()) {
    if (c.id !== ignorarId && c.nome.toLowerCase() === alvo) throw new CategoriaDuplicada(nome);
  }
}

export const estoqueCategoriasRepository: EstoqueCategoriasRepository = {
  async listar() {
    return Array.from(estoqueStore.categorias.values()).sort((a, b) =>
      a.nome.localeCompare(b.nome),
    );
  },

  async obterPorId(id) {
    return estoqueStore.categorias.get(id) ?? null;
  },

  async criar(dados) {
    garantirNomeLivre(dados.nome.trim());
    const nova = { id: randomUUID(), nome: dados.nome.trim(), criadoEm: new Date() };
    estoqueStore.categorias.set(nova.id, nova);
    return nova;
  },

  async atualizar(id, dados) {
    const atual = estoqueStore.categorias.get(id);
    if (!atual) throw new CategoriaNaoEncontrada(id);
    if (dados.nome !== undefined) garantirNomeLivre(dados.nome.trim(), id);
    const atualizada = {
      ...atual,
      ...(dados.nome !== undefined ? { nome: dados.nome.trim() } : {}),
    };
    estoqueStore.categorias.set(id, atualizada);
    return atualizada;
  },

  async remover(id) {
    estoqueStore.categorias.delete(id);
    // Desvincula materiais (espelha ON DELETE SET NULL).
    for (const [mid, m] of estoqueStore.materiais) {
      if (m.categoriaId === id) {
        estoqueStore.materiais.set(mid, { ...m, categoriaId: null });
      }
    }
  },

  async obterOuCriarPorNome(nome) {
    const alvo = nome.trim();
    const existente = Array.from(estoqueStore.categorias.values()).find(
      (c) => c.nome.toLowerCase() === alvo.toLowerCase(),
    );
    if (existente) return existente;
    return this.criar({ nome: alvo });
  },
};
