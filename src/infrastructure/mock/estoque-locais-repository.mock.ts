import 'server-only';
import { randomUUID } from 'node:crypto';
import type { EstoqueLocaisRepository } from '@/application/ports/estoque-locais-repository';
import type { Local } from '@/domain/estoque/local';
import { normalizarLocal, montarRotulo } from '@/domain/estoque/local';
import { LocalEmUso, LocalNaoEncontrado } from '@/domain/errors';
import { estoqueStore } from './estoque-store.mock';

function chaveDe(l: Pick<Local, 'unidade' | 'sala' | 'prateleira' | 'armario'>): string {
  return `${l.unidade}|${l.sala ?? ''}|${l.prateleira ?? ''}|${l.armario ?? ''}`;
}

export const estoqueLocaisRepository: EstoqueLocaisRepository = {
  async listar(filtros) {
    return Array.from(estoqueStore.locais.values())
      .filter((l) => (filtros?.unidade ? l.unidade === filtros.unidade : true))
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo));
  },

  async obterPorId(id) {
    return estoqueStore.locais.get(id) ?? null;
  },

  async criar(dados) {
    const norm = normalizarLocal(dados);
    const novo: Local = {
      id: randomUUID(),
      unidade: norm.unidade,
      sala: norm.sala,
      prateleira: norm.prateleira,
      armario: norm.armario,
      rotulo: norm.rotulo,
      observacao: dados.observacao ?? null,
      criadoEm: new Date(),
    };
    estoqueStore.locais.set(novo.id, novo);
    return novo;
  },

  async atualizar(id, dados) {
    const atual = estoqueStore.locais.get(id);
    if (!atual) throw new LocalNaoEncontrado(id);
    const combinado = {
      unidade: dados.unidade ?? atual.unidade,
      sala: dados.sala !== undefined ? dados.sala : atual.sala,
      prateleira: dados.prateleira !== undefined ? dados.prateleira : atual.prateleira,
      armario: dados.armario !== undefined ? dados.armario : atual.armario,
    };
    const norm = normalizarLocal(combinado);
    const atualizado: Local = {
      ...atual,
      unidade: norm.unidade,
      sala: norm.sala,
      prateleira: norm.prateleira,
      armario: norm.armario,
      rotulo: montarRotulo(norm.unidade, norm.sala, norm.prateleira, norm.armario),
      observacao: dados.observacao !== undefined ? dados.observacao : atual.observacao,
    };
    estoqueStore.locais.set(id, atualizado);
    return atualizado;
  },

  async remover(id) {
    if (!estoqueStore.locais.has(id)) throw new LocalNaoEncontrado(id);
    const usadoPorSaldo = Array.from(estoqueStore.saldos.values()).some(
      (s) => s.localId === id,
    );
    const usadoPorUnidade = Array.from(estoqueStore.unidades.values()).some(
      (u) => u.localId === id,
    );
    const usadoPorMov = estoqueStore.movimentacoes.some(
      (m) => m.localOrigemId === id || m.localDestinoId === id,
    );
    if (usadoPorSaldo || usadoPorUnidade || usadoPorMov) throw new LocalEmUso(id);
    estoqueStore.locais.delete(id);
  },

  async obterOuCriar(normalizado) {
    const existente = Array.from(estoqueStore.locais.values()).find(
      (l) => chaveDe(l) === normalizado.chave,
    );
    if (existente) return existente;
    const novo: Local = {
      id: randomUUID(),
      unidade: normalizado.unidade,
      sala: normalizado.sala,
      prateleira: normalizado.prateleira,
      armario: normalizado.armario,
      rotulo: normalizado.rotulo,
      observacao: null,
      criadoEm: new Date(),
    };
    estoqueStore.locais.set(novo.id, novo);
    return novo;
  },
};
