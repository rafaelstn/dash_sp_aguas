import 'server-only';
import { randomUUID } from 'node:crypto';
import type { EstoqueCategoriasRepository } from '@/application/ports/estoque-categorias-repository';
import { CategoriaNaoEncontrada } from '@/domain/errors';
import { estoqueStore } from './estoque-store.mock';

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
    const nova = { id: randomUUID(), nome: dados.nome.trim(), criadoEm: new Date() };
    estoqueStore.categorias.set(nova.id, nova);
    return nova;
  },

  async atualizar(id, dados) {
    const atual = estoqueStore.categorias.get(id);
    if (!atual) throw new CategoriaNaoEncontrada(id);
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
