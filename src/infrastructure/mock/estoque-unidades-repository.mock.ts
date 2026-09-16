import 'server-only';
import { randomUUID } from 'node:crypto';
import type { EstoqueUnidadesRepository } from '@/application/ports/estoque-unidades-repository';
import type { FiltrosUnidade, Unidade } from '@/domain/estoque/unidade';
import { TETO_EXPORT, type UnidadeExport } from '@/domain/estoque/export';
import { CodigoUnidadeDuplicado, UnidadeNaoEncontrada } from '@/domain/errors';
import { estoqueStore } from './estoque-store.mock';

/**
 * Espelha `uq_estoque_unidades_codigo` (migration 0073): único quando preenchido,
 * sem diferenciar caixa, como a busca e o leitor da conferência comparam.
 */
function garantirCodigoLivre(codigo: string | null | undefined, ignorarId?: string): void {
  if (!codigo) return;
  const alvo = codigo.toLowerCase();
  for (const u of estoqueStore.unidades.values()) {
    if (u.id !== ignorarId && u.codigo?.toLowerCase() === alvo) throw new CodigoUnidadeDuplicado(codigo);
  }
}

function contemBusca(u: Unidade, busca: string): boolean {
  const alvo = busca.toLowerCase();
  const compacto = alvo.replace(/\s+/g, '');
  const identificador = (v: string | null | undefined) =>
    v?.toLowerCase().replace(/\s+/g, '').includes(compacto) ?? false;
  return (
    u.descricao.toLowerCase().includes(alvo) ||
    identificador(u.numeroSerie) ||
    identificador(u.codigoSpaguas) ||
    identificador(u.patDaee) ||
    identificador(u.outrosPat) ||
    (u.codigo?.toLowerCase().includes(alvo) ?? false)
  );
}

/** Aplica os mesmos filtros de `listar`/`listarParaExport` e ordena por descricao. */
function filtrarOrdenar(filtros: FiltrosUnidade): Unidade[] {
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
  if (filtros.codigo) {
    const alvo = filtros.codigo.toLowerCase();
    itens = itens.filter((u) => u.codigo?.toLowerCase() === alvo);
  }
  if (filtros.busca) itens = itens.filter((u) => contemBusca(u, filtros.busca as string));
  itens.sort((a, b) => a.descricao.localeCompare(b.descricao));
  return itens;
}

export const estoqueUnidadesRepository: EstoqueUnidadesRepository = {
  async listar(filtros) {
    const itens = filtrarOrdenar(filtros);
    const total = itens.length;
    const pagina = Math.max(filtros.pagina ?? 1, 1);
    const porPagina = Math.min(Math.max(filtros.porPagina ?? 50, 1), 200);
    const inicio = (pagina - 1) * porPagina;
    return { itens: itens.slice(inicio, inicio + porPagina), total };
  },

  async listarParaExport(filtros) {
    return filtrarOrdenar(filtros)
      .slice(0, TETO_EXPORT)
      .map((u): UnidadeExport => {
        const local = u.localId ? estoqueStore.locais.get(u.localId) : undefined;
        return {
          ...u,
          unidadeFisica: local?.unidade ?? null,
          localRotulo: local?.rotulo ?? null,
        };
      });
  },

  async obterPorId(id) {
    return estoqueStore.unidades.get(id) ?? null;
  },

  async criar(dados) {
    garantirCodigoLivre(dados.codigo);
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
    garantirCodigoLivre(dados.codigo, id);
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
