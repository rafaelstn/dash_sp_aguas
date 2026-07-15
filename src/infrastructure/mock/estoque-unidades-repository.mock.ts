import 'server-only';
import { randomUUID } from 'node:crypto';
import type { EstoqueUnidadesRepository } from '@/application/ports/estoque-unidades-repository';
import type { Unidade } from '@/domain/estoque/unidade';
import { UnidadeNaoEncontrada } from '@/domain/errors';
import { estoqueStore } from './estoque-store.mock';

function contemBusca(u: Unidade, busca: string): boolean {
  const alvo = busca.toLowerCase();
  return (
    u.descricao.toLowerCase().includes(alvo) ||
    (u.numeroSerie?.toLowerCase().includes(alvo) ?? false) ||
    (u.codigoSpaguas?.toLowerCase().includes(alvo) ?? false) ||
    (u.patDaee?.toLowerCase().includes(alvo) ?? false) ||
    (u.codigo?.toLowerCase().includes(alvo) ?? false)
  );
}

export const estoqueUnidadesRepository: EstoqueUnidadesRepository = {
  async listar(filtros) {
    let itens = Array.from(estoqueStore.unidades.values());
    if (filtros.unidade) {
      itens = itens.filter((u) => {
        if (!u.localId) return false;
        const local = estoqueStore.locais.get(u.localId);
        return local?.unidade === filtros.unidade;
      });
    }
    if (filtros.localId) itens = itens.filter((u) => u.localId === filtros.localId);
    if (filtros.estado) itens = itens.filter((u) => u.estado === filtros.estado);
    if (filtros.status) itens = itens.filter((u) => u.status === filtros.status);
    if (filtros.materialId) itens = itens.filter((u) => u.materialId === filtros.materialId);
    if (filtros.busca) itens = itens.filter((u) => contemBusca(u, filtros.busca as string));
    itens.sort((a, b) => a.descricao.localeCompare(b.descricao));

    const total = itens.length;
    const pagina = Math.max(filtros.pagina ?? 1, 1);
    const porPagina = Math.min(Math.max(filtros.porPagina ?? 50, 1), 200);
    const inicio = (pagina - 1) * porPagina;
    return { itens: itens.slice(inicio, inicio + porPagina), total };
  },

  async obterPorId(id) {
    return estoqueStore.unidades.get(id) ?? null;
  },

  async criar(dados) {
    const agora = new Date();
    const nova: Unidade = {
      id: randomUUID(),
      materialId: dados.materialId ?? null,
      codigo: dados.codigo ?? null,
      codigoSpaguas: dados.codigoSpaguas ?? null,
      patDaee: dados.patDaee ?? null,
      outrosPat: dados.outrosPat ?? null,
      numeroSerie: dados.numeroSerie ?? null,
      helice: dados.helice ?? null,
      descricao: dados.descricao.trim(),
      marca: dados.marca ?? null,
      modelo: dados.modelo ?? null,
      estado: dados.estado ?? null,
      status: dados.status ?? 'ativo',
      localId: dados.localId ?? null,
      dataAquisicao: dados.dataAquisicao ?? null,
      observacao: dados.observacao ?? null,
      chaveImport: dados.chaveImport ?? null,
      criadoEm: agora,
      atualizadoEm: agora,
    };
    estoqueStore.unidades.set(nova.id, nova);
    return nova;
  },

  async atualizar(id, dados) {
    const atual = estoqueStore.unidades.get(id);
    if (!atual) throw new UnidadeNaoEncontrada(id);
    const chaves: (keyof typeof dados)[] = [
      'materialId', 'codigo', 'codigoSpaguas', 'patDaee', 'outrosPat',
      'numeroSerie', 'helice', 'descricao', 'marca', 'modelo', 'estado',
      'status', 'localId', 'dataAquisicao', 'observacao', 'chaveImport',
    ];
    const atualizada: Unidade = { ...atual, atualizadoEm: new Date() };
    for (const k of chaves) {
      if (dados[k] !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (atualizada as any)[k] = dados[k];
      }
    }
    if (typeof atualizada.descricao === 'string') {
      atualizada.descricao = atualizada.descricao.trim();
    }
    estoqueStore.unidades.set(id, atualizada);
    return atualizada;
  },

  async possuiMovimentacao(id) {
    return estoqueStore.movimentacoes.some((m) => m.unidadeId === id);
  },

  async remover(id) {
    if (!estoqueStore.unidades.has(id)) throw new UnidadeNaoEncontrada(id);
    estoqueStore.unidades.delete(id);
  },
};
