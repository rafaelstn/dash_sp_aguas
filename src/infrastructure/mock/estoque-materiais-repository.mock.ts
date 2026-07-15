import 'server-only';
import { randomUUID } from 'node:crypto';
import type { EstoqueMateriaisRepository } from '@/application/ports/estoque-materiais-repository';
import type { Material } from '@/domain/estoque/material';
import { MaterialNaoEncontrado } from '@/domain/errors';
import { estoqueStore } from './estoque-store.mock';

function contemBusca(m: Material, busca: string): boolean {
  const alvo = busca.toLowerCase();
  return (
    m.descricao.toLowerCase().includes(alvo) ||
    (m.marca?.toLowerCase().includes(alvo) ?? false) ||
    (m.modelo?.toLowerCase().includes(alvo) ?? false)
  );
}

export const estoqueMateriaisRepository: EstoqueMateriaisRepository = {
  async listar(filtros) {
    let itens = Array.from(estoqueStore.materiais.values());
    if (filtros.natureza) itens = itens.filter((m) => m.natureza === filtros.natureza);
    if (filtros.categoriaId) itens = itens.filter((m) => m.categoriaId === filtros.categoriaId);
    if (filtros.apenasAtivos) itens = itens.filter((m) => m.ativo);
    if (filtros.busca) itens = itens.filter((m) => contemBusca(m, filtros.busca as string));
    itens.sort((a, b) => a.descricao.localeCompare(b.descricao));

    const total = itens.length;
    const pagina = Math.max(filtros.pagina ?? 1, 1);
    const porPagina = Math.min(Math.max(filtros.porPagina ?? 50, 1), 200);
    const inicio = (pagina - 1) * porPagina;
    return { itens: itens.slice(inicio, inicio + porPagina), total };
  },

  async obterPorId(id) {
    return estoqueStore.materiais.get(id) ?? null;
  },

  async criar(dados) {
    const agora = new Date();
    const novo: Material = {
      id: randomUUID(),
      descricao: dados.descricao.trim(),
      marca: dados.marca ?? null,
      modelo: dados.modelo ?? null,
      natureza: dados.natureza,
      unidadeMedida: dados.unidadeMedida ?? null,
      categoriaId: dados.categoriaId ?? null,
      ativo: dados.ativo ?? true,
      criadoEm: agora,
      atualizadoEm: agora,
    };
    estoqueStore.materiais.set(novo.id, novo);
    return novo;
  },

  async atualizar(id, dados) {
    const atual = estoqueStore.materiais.get(id);
    if (!atual) throw new MaterialNaoEncontrado(id);
    const atualizado: Material = {
      ...atual,
      ...(dados.descricao !== undefined ? { descricao: dados.descricao.trim() } : {}),
      ...(dados.marca !== undefined ? { marca: dados.marca } : {}),
      ...(dados.modelo !== undefined ? { modelo: dados.modelo } : {}),
      ...(dados.natureza !== undefined ? { natureza: dados.natureza } : {}),
      ...(dados.unidadeMedida !== undefined ? { unidadeMedida: dados.unidadeMedida } : {}),
      ...(dados.categoriaId !== undefined ? { categoriaId: dados.categoriaId } : {}),
      ...(dados.ativo !== undefined ? { ativo: dados.ativo } : {}),
      atualizadoEm: new Date(),
    };
    estoqueStore.materiais.set(id, atualizado);
    return atualizado;
  },

  async inativar(id) {
    const atual = estoqueStore.materiais.get(id);
    if (!atual) throw new MaterialNaoEncontrado(id);
    const inativado = { ...atual, ativo: false, atualizadoEm: new Date() };
    estoqueStore.materiais.set(id, inativado);
    return inativado;
  },

  async possuiVinculos(id) {
    const emUnidade = Array.from(estoqueStore.unidades.values()).some(
      (u) => u.materialId === id,
    );
    const emSaldo = Array.from(estoqueStore.saldos.values()).some(
      (s) => s.materialId === id,
    );
    const emMov = estoqueStore.movimentacoes.some((m) => m.materialId === id);
    return emUnidade || emSaldo || emMov;
  },

  async remover(id) {
    if (!estoqueStore.materiais.has(id)) throw new MaterialNaoEncontrado(id);
    estoqueStore.materiais.delete(id);
  },
};
