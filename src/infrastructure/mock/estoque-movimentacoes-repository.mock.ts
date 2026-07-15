import 'server-only';
import { randomUUID } from 'node:crypto';
import type { EstoqueMovimentacoesRepository } from '@/application/ports/estoque-movimentacoes-repository';
import type {
  ComandoMovimentacao,
  FiltrosMovimentacao,
  Movimentacao,
  ResultadoMovimentacao,
} from '@/domain/estoque/movimentacao';
import type { Saldo } from '@/domain/estoque/saldo';
import type { Unidade } from '@/domain/estoque/unidade';
import { TETO_EXPORT, type MovimentacaoExport } from '@/domain/estoque/export';
import { transicaoValida } from '@/domain/estoque/status-unidade';
import {
  MaterialNaoEncontrado,
  NaturezaIncompativel,
  SaldoInsuficiente,
  TransicaoStatusInvalida,
  UnidadeNaoEncontrada,
} from '@/domain/errors';
import { estoqueStore, chaveSaldoMock } from './estoque-store.mock';

/**
 * Mock in-memory da movimentacao. Replica a MESMA logica e os MESMOS erros de
 * dominio do adapter `.pg` (que faz a transacao real). Sem `sql.begin` aqui: em
 * memoria as operacoes sao sincronas e nao ha concorrencia; a garantia de
 * nao-negativo do banco (UPDATE guardado + CHECK) e simulada pela checagem
 * `saldoAtual < q -> SaldoInsuficiente`. A prova do comportamento sob
 * concorrencia real (Postgres) esta no `.pg` + no teste de regressao estatica.
 */

function upsertMais(
  materialId: string,
  localId: string,
  tamanho: string | null,
  q: number,
): Saldo {
  const chave = chaveSaldoMock(materialId, localId, tamanho);
  const atual = estoqueStore.saldos.get(chave);
  const novo: Saldo = atual
    ? { ...atual, quantidade: atual.quantidade + q, atualizadoEm: new Date() }
    : {
        id: randomUUID(),
        materialId,
        localId,
        quantidade: q,
        tamanho,
        atualizadoEm: new Date(),
      };
  estoqueStore.saldos.set(chave, novo);
  return novo;
}

function guardadoMenos(
  materialId: string,
  localId: string,
  tamanho: string | null,
  q: number,
): Saldo {
  const chave = chaveSaldoMock(materialId, localId, tamanho);
  const atual = estoqueStore.saldos.get(chave);
  // Espelha o UPDATE guardado `WHERE quantidade >= q` do .pg: ausente ou
  // insuficiente => 0 linhas afetadas => saldo_insuficiente.
  if (!atual || atual.quantidade < q) {
    throw new SaldoInsuficiente(materialId, localId, q);
  }
  const novo: Saldo = { ...atual, quantidade: atual.quantidade - q, atualizadoEm: new Date() };
  estoqueStore.saldos.set(chave, novo);
  return novo;
}

/**
 * NUCLEO in-memory da movimentacao, reutilizavel pela reconciliacao de
 * conferencia (mock). Espelha o `aplicarMovimentacaoNaTx` do `.pg`: mesma logica,
 * mesmos erros de dominio, `conferenciaId` carimba a linha do ledger. Em memoria
 * nao ha transacao/concorrencia; a garantia de nao-negativo e simulada por
 * `guardadoMenos`. Sincrono (as operacoes de Map sao sincronas).
 */
export function aplicarMovimentacaoNaMemoria(
  cmd: ComandoMovimentacao,
  conferenciaId: string | null = null,
): ResultadoMovimentacao {
  if (cmd.alvo.natureza === 'serializado') {
      const unidade = estoqueStore.unidades.get(cmd.alvo.unidadeId);
      if (!unidade) throw new UnidadeNaoEncontrada(cmd.alvo.unidadeId);

      const estadoAnterior = unidade.estado;
      const statusAnterior = unidade.status;
      let estadoNovo = estadoAnterior;
      let statusNovo = statusAnterior;
      let localNovo = unidade.localId;
      let localOrigemId: string | null = null;
      let localDestinoId: string | null = null;

      switch (cmd.tipo) {
        case 'entrada':
          localDestinoId = cmd.localDestinoId;
          localNovo = cmd.localDestinoId;
          break;
        case 'saida':
          localOrigemId = cmd.localOrigemId;
          localNovo = null;
          break;
        case 'transferencia':
          localOrigemId = cmd.localOrigemId;
          localDestinoId = cmd.localDestinoId;
          localNovo = cmd.localDestinoId;
          break;
        case 'baixa':
          if (!transicaoValida(statusAnterior, 'descarte')) {
            throw new TransicaoStatusInvalida(statusAnterior, 'descarte');
          }
          statusNovo = 'descarte';
          break;
        case 'ajuste':
          // Override auditavel: aceita qualquer status valido (inclusive reverter
          // descarte), pois ja veio com motivo obrigatorio.
          if (cmd.novoStatus !== undefined) statusNovo = cmd.novoStatus;
          if (cmd.novoEstado !== undefined) estadoNovo = cmd.novoEstado;
          if (cmd.localDestinoId) {
            localOrigemId = unidade.localId;
            localDestinoId = cmd.localDestinoId;
            localNovo = cmd.localDestinoId;
          }
          break;
      }

      const unidadeAtualizada: Unidade = {
        ...unidade,
        estado: estadoNovo,
        status: statusNovo,
        localId: localNovo,
        atualizadoEm: new Date(),
      };
      estoqueStore.unidades.set(unidade.id, unidadeAtualizada);

      const mov: Movimentacao = {
        id: randomUUID(),
        tipo: cmd.tipo,
        unidadeId: unidade.id,
        materialId: null,
        quantidade: 1,
        localOrigemId,
        localDestinoId,
        estadoAnterior,
        estadoNovo,
        statusAnterior,
        statusNovo,
        motivo: cmd.motivo,
        usuarioId: cmd.usuarioId,
        conferenciaId,
        criadoEm: new Date(),
      };
      estoqueStore.movimentacoes.push(mov);
      return { movimentacao: mov, saldo: null, unidade: unidadeAtualizada };
    }

    // Quantificavel
    const materialId = cmd.alvo.materialId;
    const material = estoqueStore.materiais.get(materialId);
    if (!material) throw new MaterialNaoEncontrado(materialId);
    if (material.natureza !== 'quantificavel') {
      throw new NaturezaIncompativel('quantificavel', material.natureza);
    }

    const q = cmd.quantidade;
    let saldo: Saldo | null = null;
    let localOrigemId: string | null = null;
    let localDestinoId: string | null = null;

    switch (cmd.tipo) {
      case 'entrada':
        saldo = upsertMais(materialId, cmd.localDestinoId as string, cmd.tamanho, q);
        localDestinoId = cmd.localDestinoId;
        break;
      case 'saida':
      case 'baixa':
        saldo = guardadoMenos(materialId, cmd.localOrigemId as string, cmd.tamanho, q);
        localOrigemId = cmd.localOrigemId;
        break;
      case 'transferencia':
        guardadoMenos(materialId, cmd.localOrigemId as string, cmd.tamanho, q);
        saldo = upsertMais(materialId, cmd.localDestinoId as string, cmd.tamanho, q);
        localOrigemId = cmd.localOrigemId;
        localDestinoId = cmd.localDestinoId;
        break;
      case 'ajuste':
        // ajuste nao se aplica a quantificavel (barrado no dominio). Guard extra.
        throw new NaturezaIncompativel('serializado', 'quantificavel');
    }

    const mov: Movimentacao = {
      id: randomUUID(),
      tipo: cmd.tipo,
      unidadeId: null,
      materialId,
      quantidade: q,
      localOrigemId,
      localDestinoId,
      estadoAnterior: null,
      estadoNovo: null,
      statusAnterior: null,
      statusNovo: null,
      motivo: cmd.motivo,
      usuarioId: cmd.usuarioId,
      conferenciaId,
      criadoEm: new Date(),
    };
    estoqueStore.movimentacoes.push(mov);
    return { movimentacao: mov, saldo, unidade: null };
}

export const estoqueMovimentacoesRepository: EstoqueMovimentacoesRepository = {
  async registrar(cmd: ComandoMovimentacao): Promise<ResultadoMovimentacao> {
    return aplicarMovimentacaoNaMemoria(cmd, null);
  },

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
      .map((m): MovimentacaoExport => {
        const unidade = m.unidadeId ? estoqueStore.unidades.get(m.unidadeId) : undefined;
        const material = m.materialId ? estoqueStore.materiais.get(m.materialId) : undefined;
        const lo = m.localOrigemId ? estoqueStore.locais.get(m.localOrigemId) : undefined;
        const ld = m.localDestinoId ? estoqueStore.locais.get(m.localDestinoId) : undefined;
        return {
          ...m,
          itemDescricao: unidade?.descricao ?? material?.descricao ?? null,
          itemIdentificacao: unidade
            ? unidade.patDaee ?? unidade.numeroSerie ?? unidade.codigo ?? unidade.codigoSpaguas ?? null
            : null,
          localOrigemRotulo: lo?.rotulo ?? null,
          localDestinoRotulo: ld?.rotulo ?? null,
        };
      });
  },
};

/** Aplica os mesmos filtros de `listar`/`listarParaExport` e ordena por data desc. */
function filtrarOrdenar(filtros: FiltrosMovimentacao): Movimentacao[] {
  let itens = [...estoqueStore.movimentacoes];
  if (filtros.tipo) itens = itens.filter((m) => m.tipo === filtros.tipo);
  if (filtros.unidadeId) itens = itens.filter((m) => m.unidadeId === filtros.unidadeId);
  if (filtros.materialId) itens = itens.filter((m) => m.materialId === filtros.materialId);
  if (filtros.usuarioId) itens = itens.filter((m) => m.usuarioId === filtros.usuarioId);
  if (filtros.localId) {
    itens = itens.filter(
      (m) => m.localOrigemId === filtros.localId || m.localDestinoId === filtros.localId,
    );
  }
  if (filtros.de) itens = itens.filter((m) => m.criadoEm >= (filtros.de as Date));
  if (filtros.ate) itens = itens.filter((m) => m.criadoEm <= (filtros.ate as Date));
  itens.sort((a, b) => b.criadoEm.getTime() - a.criadoEm.getTime());
  return itens;
}
