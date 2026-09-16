import 'server-only';
import { randomUUID } from 'node:crypto';
import type { EstoqueDesconformidadesRepository } from '@/application/ports/estoque-desconformidades-repository';
import {
  compararDesconformidades,
  DesconformidadeAlterada,
  DesconformidadeNaoEncontrada,
  type Desconformidade,
} from '@/domain/estoque/desconformidade';
import { UnidadeNaoEncontrada } from '@/domain/errors';
import { estoqueStore } from './estoque-store.mock';

/**
 * Mock em memória (modo demo e testes). Começa vazio: no mundo real quem cria
 * desconformidade é o importador, e o demo não roda carga de planilha. Em teste,
 * `_semearDesconformidadeMock` faz o papel do importador.
 */
const store = new Map<string, Desconformidade>();

export function _resetEstoqueDesconformidadesMock(): void {
  store.clear();
}

export function _semearDesconformidadeMock(
  parcial: Partial<Desconformidade> & Pick<Desconformidade, 'tipo' | 'detalhe'>,
): Desconformidade {
  const agora = new Date();
  const nova: Desconformidade = {
    id: randomUUID(),
    origem: 'importacao_planilha',
    aba: null,
    linha: null,
    dados: {},
    status: 'aberta',
    nota: null,
    unidadeId: null,
    resolvidaPor: null,
    resolvidaEm: null,
    detectadaEm: agora,
    ultimaDeteccaoEm: agora,
    ...parcial,
  };
  store.set(nova.id, nova);
  return nova;
}

export const estoqueDesconformidadesRepository: EstoqueDesconformidadesRepository = {
  async listar(filtros) {
    const doTipo = Array.from(store.values()).filter((d) => !filtros.tipo || d.tipo === filtros.tipo);
    const contagem = { aberta: 0, resolvida: 0, ignorada: 0 };
    for (const d of doTipo) contagem[d.status] += 1;
    const filtradas = doTipo
      .filter((d) => !filtros.status || d.status === filtros.status)
      .sort(compararDesconformidades);
    const porPagina = Math.min(Math.max(filtros.porPagina, 1), 200);
    const inicio = (Math.max(filtros.pagina, 1) - 1) * porPagina;
    return {
      itens: filtradas.slice(inicio, inicio + porPagina),
      total: filtradas.length,
      contagem,
    };
  },

  async obterPorId(id) {
    return store.get(id) ?? null;
  },

  async decidir(id, decisao, opcoes) {
    const atual = store.get(id);
    if (!atual) throw new DesconformidadeNaoEncontrada(id);
    // Espelha o WHERE do adapter pg: status diferente do esperado não grava.
    if (opcoes?.statusEsperado && atual.status !== opcoes.statusEsperado) {
      throw new DesconformidadeAlterada(id, opcoes.statusEsperado, atual.status);
    }
    // Espelha a FK de unidade_id.
    if (decisao.unidadeId && !estoqueStore.unidades.has(decisao.unidadeId)) {
      throw new UnidadeNaoEncontrada(decisao.unidadeId);
    }
    const nova: Desconformidade = {
      ...atual,
      status: decisao.status,
      nota: decisao.nota,
      unidadeId: decisao.unidadeId,
      resolvidaPor: decisao.resolvidaPor,
      resolvidaEm: decisao.status === 'aberta' ? null : new Date(),
    };
    store.set(id, nova);
    return {
      anterior: atual.status,
      decisaoAnterior: {
        resolvidaPor: atual.resolvidaPor,
        resolvidaEm: atual.resolvidaEm,
        unidadeId: atual.unidadeId,
      },
      atual: nova,
    };
  },
};
