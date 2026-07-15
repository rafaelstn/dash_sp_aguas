import 'server-only';
import { randomUUID } from 'node:crypto';
import type { EstoqueConferenciasRepository } from '@/application/ports/estoque-conferencias-repository';
import type {
  Conferencia,
  ConferenciaItem,
  ResultadoReconciliacao,
  ResumoDivergencias,
  SituacaoItem,
} from '@/domain/estoque/conferencia';
import {
  calcularDivergencia,
  motivoReconciliacao,
  resolverReconciliacao,
  statusConferenciaValido,
} from '@/domain/estoque/conferencia';
import {
  ConferenciaFechada,
  ConferenciaNaoConcluida,
  ConferenciaNaoEncontrada,
  DadosInvalidos,
  EscopoConferenciaEmAberto,
  ItemConferenciaNaoEncontrado,
  MaterialNaoEncontrado,
  NaturezaIncompativel,
  UnidadeNaoEncontrada,
} from '@/domain/errors';
import { estoqueStore, chaveSaldoMock } from './estoque-store.mock';
import { aplicarMovimentacaoNaMemoria } from './estoque-movimentacoes-repository.mock';

/**
 * Mock in-memory da conferencia fisica (MODO DEMO + teste de use-case). Replica a
 * MESMA logica e os MESMOS erros de dominio do adapter `.pg` (que faz a transacao
 * real). Sem `sql.begin` aqui: em memoria as operacoes sao sincronas. A prova do
 * fluxo transacional (snapshot INSERT..SELECT, FOR UPDATE, idempotencia por
 * reconciliado_em) contra Postgres real vive no `.pg` + na regressao estatica.
 */

function recalcularDiferenca(item: ConferenciaItem): number | null {
  if (item.quantidadeContada === null || item.quantidadeSistema === null) return null;
  return item.quantidadeContada - item.quantidadeSistema;
}

function itensDaConferencia(conferenciaId: string): ConferenciaItem[] {
  return Array.from(estoqueStore.conferenciaItens.values()).filter(
    (i) => i.conferenciaId === conferenciaId,
  );
}

function exigirConferencia(id: string): Conferencia {
  const conf = estoqueStore.conferencias.get(id);
  if (!conf) throw new ConferenciaNaoEncontrada(id);
  return conf;
}

export const estoqueConferenciasRepository: EstoqueConferenciasRepository = {
  async abrir(comando) {
    // Guarda de escopo: nenhuma sessao aberta na mesma unidade+natureza+local
    // (espelha o indice unico parcial uq_estoque_conf_aberta_escopo).
    const jaAberta = Array.from(estoqueStore.conferencias.values()).some(
      (c) =>
        c.status === 'aberta' &&
        c.unidade === comando.unidade &&
        c.natureza === comando.natureza &&
        (c.localId ?? null) === (comando.localId ?? null),
    );
    if (jaAberta) {
      throw new EscopoConferenciaEmAberto(comando.unidade, comando.natureza, comando.localId);
    }

    const agora = new Date();
    const conf: Conferencia = {
      id: randomUUID(),
      unidade: comando.unidade,
      natureza: comando.natureza,
      localId: comando.localId,
      status: 'aberta',
      observacao: comando.observacao,
      criadaPor: comando.criadaPor,
      criadaEm: agora,
      concluidaPor: null,
      concluidaEm: null,
      atualizadaEm: agora,
    };
    estoqueStore.conferencias.set(conf.id, conf);

    // Snapshot congelado (espelha o INSERT ... SELECT do .pg).
    if (comando.natureza === 'serializado') {
      for (const u of estoqueStore.unidades.values()) {
        // Unidades com local_id nulo NAO entram (sem localizacao para comparar).
        if (!u.localId) continue;
        const local = estoqueStore.locais.get(u.localId);
        if (!local || local.unidade !== comando.unidade) continue;
        if (comando.localId && u.localId !== comando.localId) continue;
        if (u.status !== 'ativo' && u.status !== 'defeito') continue;
        criarItemSnapshotSerializado(conf.id, u.id, u.localId, agora);
      }
    } else {
      for (const s of estoqueStore.saldos.values()) {
        if (s.quantidade <= 0) continue;
        const local = estoqueStore.locais.get(s.localId);
        if (!local || local.unidade !== comando.unidade) continue;
        if (comando.localId && s.localId !== comando.localId) continue;
        criarItemSnapshotQuantificavel(
          conf.id,
          s.materialId,
          s.localId,
          s.tamanho,
          s.quantidade,
          agora,
        );
      }
    }

    return conf;
  },

  async listar(filtros) {
    let itens = Array.from(estoqueStore.conferencias.values());
    if (filtros.unidade) itens = itens.filter((c) => c.unidade === filtros.unidade);
    if (filtros.natureza) itens = itens.filter((c) => c.natureza === filtros.natureza);
    if (filtros.status) itens = itens.filter((c) => c.status === filtros.status);
    itens.sort((a, b) => b.criadaEm.getTime() - a.criadaEm.getTime());
    const total = itens.length;
    const pagina = Math.max(filtros.pagina ?? 1, 1);
    const porPagina = Math.min(Math.max(filtros.porPagina ?? 50, 1), 200);
    const inicio = (pagina - 1) * porPagina;
    return { itens: itens.slice(inicio, inicio + porPagina), total };
  },

  async obterPorId(id) {
    return estoqueStore.conferencias.get(id) ?? null;
  },

  async resumoDivergencias(id) {
    exigirConferencia(id);
    return resumir(itensDaConferencia(id));
  },

  async listarItens(conferenciaId, filtros) {
    exigirConferencia(conferenciaId);
    let itens = itensDaConferencia(conferenciaId);
    if (filtros.situacao) itens = itens.filter((i) => i.situacao === filtros.situacao);
    if (filtros.apenasDivergentes) {
      itens = itens.filter((i) => calcularDivergencia(i).divergente);
    }
    if (filtros.apenasPendentesRecon) {
      itens = itens.filter((i) => calcularDivergencia(i).divergente && i.reconciliadoEm === null);
    }
    itens.sort((a, b) => a.criadoEm.getTime() - b.criadoEm.getTime());
    const total = itens.length;
    const pagina = Math.max(filtros.pagina ?? 1, 1);
    const porPagina = Math.min(Math.max(filtros.porPagina ?? 100, 1), 500);
    const inicio = (pagina - 1) * porPagina;
    return { itens: itens.slice(inicio, inicio + porPagina), total };
  },

  async obterItem(conferenciaId, itemId) {
    const item = estoqueStore.conferenciaItens.get(itemId);
    // Guarda de IDOR: o item tem que pertencer a conferencia do path.
    if (!item || item.conferenciaId !== conferenciaId) return null;
    return item;
  },

  async registrarContagem(conferenciaId, itemId, contagem) {
    const conf = exigirConferencia(conferenciaId);
    const item = estoqueStore.conferenciaItens.get(itemId);
    if (!item || item.conferenciaId !== conferenciaId) {
      throw new ItemConferenciaNaoEncontrado(itemId);
    }
    if (conf.status !== 'aberta') throw new ConferenciaFechada(conferenciaId, conf.status);

    const serializado = item.unidadeId !== null;
    if (serializado && contagem.tipo !== 'serializado') {
      throw new NaturezaIncompativel('serializado', 'quantificavel');
    }
    if (!serializado && contagem.tipo !== 'quantificavel') {
      throw new NaturezaIncompativel('quantificavel', 'serializado');
    }

    const atualizado: ConferenciaItem = { ...item, atualizadoEm: new Date() };
    if (contagem.tipo === 'serializado') {
      // A partir de `pendente` qualquer das 3 situacoes contadas e valida; a
      // reclassificacao entre situacoes contadas (ex.: nao_encontrado ->
      // conferido) tambem, enquanto a sessao esta aberta. `situacaoContagemValida`
      // (pura, testada) so barra volta a `pendente`, que o schema ja nao permite.
      atualizado.situacao = contagem.situacao;
      atualizado.localEncontradoId =
        contagem.situacao === 'encontrado_em_outro_local' ? contagem.localEncontradoId : null;
      if (contagem.observacao !== null) atualizado.observacao = contagem.observacao;
    } else {
      atualizado.quantidadeContada = contagem.quantidadeContada;
      atualizado.diferenca = recalcularDiferenca(atualizado);
      if (contagem.observacao !== null) atualizado.observacao = contagem.observacao;
    }
    estoqueStore.conferenciaItens.set(itemId, atualizado);
    return atualizado;
  },

  async adicionarSobra(conferenciaId, sobra) {
    const conf = exigirConferencia(conferenciaId);
    if (conf.status !== 'aberta') throw new ConferenciaFechada(conferenciaId, conf.status);
    // A sobra tem que ser da MESMA natureza da sessao (sessao single-natureza).
    if (conf.natureza !== sobra.tipo) throw new NaturezaIncompativel(conf.natureza, sobra.tipo);

    const agora = new Date();
    if (sobra.tipo === 'serializado') {
      const unidade = estoqueStore.unidades.get(sobra.unidadeId);
      if (!unidade) throw new UnidadeNaoEncontrada(sobra.unidadeId);
      // Nao duplica o mesmo alvo na conferencia (uq_estoque_conf_item_unidade).
      const dup = itensDaConferencia(conferenciaId).some((i) => i.unidadeId === sobra.unidadeId);
      if (dup) throw new DadosInvalidos('Esta unidade ja consta na conferencia.');
      const item: ConferenciaItem = {
        id: randomUUID(),
        conferenciaId,
        unidadeId: sobra.unidadeId,
        materialId: null,
        // esperado = onde o sistema pensa que a unidade esta (para a transferencia)
        localEsperadoId: unidade.localId,
        tamanho: null,
        origem: 'sobra',
        situacao: 'encontrado_em_outro_local',
        localEncontradoId: sobra.localEncontradoId,
        quantidadeSistema: null,
        quantidadeContada: null,
        diferenca: null,
        observacao: null,
        movimentacaoId: null,
        reconciliadoPor: null,
        reconciliadoEm: null,
        criadoEm: agora,
        atualizadoEm: agora,
      };
      estoqueStore.conferenciaItens.set(item.id, item);
      return item;
    }

    // quantificavel
    const material = estoqueStore.materiais.get(sobra.materialId);
    if (!material) throw new MaterialNaoEncontrado(sobra.materialId);
    if (material.natureza !== 'quantificavel') {
      throw new NaturezaIncompativel('quantificavel', material.natureza);
    }
    // Nao duplica (material, local, tamanho) na conferencia (uq_estoque_conf_item_material).
    const dupQ = itensDaConferencia(conferenciaId).some(
      (i) =>
        i.materialId === sobra.materialId &&
        (i.localEsperadoId ?? null) === sobra.localId &&
        (i.tamanho ?? '') === (sobra.tamanho ?? ''),
    );
    if (dupQ) throw new DadosInvalidos('Este material/local/tamanho ja consta na conferencia.');
    const item: ConferenciaItem = {
      id: randomUUID(),
      conferenciaId,
      unidadeId: null,
      materialId: sobra.materialId,
      localEsperadoId: sobra.localId,
      tamanho: sobra.tamanho,
      origem: 'sobra',
      situacao: null,
      localEncontradoId: null,
      quantidadeSistema: 0, // sem saldo no snapshot
      quantidadeContada: sobra.quantidadeContada,
      diferenca: sobra.quantidadeContada, // contada - 0
      observacao: null,
      movimentacaoId: null,
      reconciliadoPor: null,
      reconciliadoEm: null,
      criadoEm: agora,
      atualizadoEm: agora,
    };
    estoqueStore.conferenciaItens.set(item.id, item);
    return item;
  },

  async concluir(id, usuarioId, observacao) {
    return transicionar(id, 'concluida', usuarioId, observacao);
  },

  async cancelar(id, usuarioId, observacao) {
    return transicionar(id, 'cancelada', usuarioId, observacao);
  },

  async reconciliarItem(conferenciaId, itemId, usuarioId) {
    // Ordem espelha o .pg: item PRIMEIRO (guarda de IDOR + idempotencia antes de
    // qualquer outra checagem), depois o status da sessao.
    const item = estoqueStore.conferenciaItens.get(itemId);
    if (!item || item.conferenciaId !== conferenciaId) {
      throw new ItemConferenciaNaoEncontrado(itemId);
    }

    // Idempotencia: item ja reconciliado -> no-op, devolve o resultado existente.
    if (item.reconciliadoEm !== null) {
      return {
        item,
        movimentacaoId: item.movimentacaoId,
        aviso: null,
        jaReconciliado: true,
      } satisfies ResultadoReconciliacao;
    }

    const conf = exigirConferencia(conferenciaId);
    if (conf.status !== 'concluida') {
      throw new ConferenciaNaoConcluida(conferenciaId, conf.status);
    }

    const comando = resolverReconciliacao(item);
    let movimentacaoId: string | null = null;
    let aviso: 'base_alterada' | null = null;
    const atualizado: ConferenciaItem = { ...item, atualizadoEm: new Date() };

    if (comando === null) {
      // So carimba (sem tocar o estoque). nao_encontrado ganha nota de apuracao.
      if (item.situacao === 'nao_encontrado' && atualizado.observacao === null) {
        atualizado.observacao = 'nao localizado: requer apuracao';
      }
    } else {
      let cmd = comando;
      // Aviso de base alterada (quantificavel): compara o saldo atual com o
      // congelado. Nunca reconcilia em silencio sobre base que mudou (governo).
      if (item.materialId && item.localEsperadoId) {
        const saldoAtual =
          estoqueStore.saldos.get(
            chaveSaldoMock(item.materialId, item.localEsperadoId, item.tamanho),
          )?.quantidade ?? 0;
        if (saldoAtual !== item.quantidadeSistema) {
          aviso = 'base_alterada';
          cmd = {
            ...cmd,
            motivo: `${motivoReconciliacao(conferenciaId)} [base congelada ${item.quantidadeSistema}, atual ${saldoAtual}]`,
          };
        }
      }
      const resultado = aplicarMovimentacaoNaMemoria(
        { ...cmd, usuarioId },
        conferenciaId,
      );
      movimentacaoId = resultado.movimentacao.id;
    }

    atualizado.movimentacaoId = movimentacaoId;
    atualizado.reconciliadoPor = usuarioId;
    atualizado.reconciliadoEm = new Date();
    estoqueStore.conferenciaItens.set(itemId, atualizado);

    return { item: atualizado, movimentacaoId, aviso, jaReconciliado: false };
  },
};

// ── Helpers de snapshot / transicao / resumo ────────────────────────────────────

function criarItemSnapshotSerializado(
  conferenciaId: string,
  unidadeId: string,
  localEsperadoId: string,
  agora: Date,
): void {
  const item: ConferenciaItem = {
    id: randomUUID(),
    conferenciaId,
    unidadeId,
    materialId: null,
    localEsperadoId,
    tamanho: null,
    origem: 'snapshot',
    situacao: 'pendente',
    localEncontradoId: null,
    quantidadeSistema: null,
    quantidadeContada: null,
    diferenca: null,
    observacao: null,
    movimentacaoId: null,
    reconciliadoPor: null,
    reconciliadoEm: null,
    criadoEm: agora,
    atualizadoEm: agora,
  };
  estoqueStore.conferenciaItens.set(item.id, item);
}

function criarItemSnapshotQuantificavel(
  conferenciaId: string,
  materialId: string,
  localEsperadoId: string,
  tamanho: string | null,
  quantidadeSistema: number,
  agora: Date,
): void {
  const item: ConferenciaItem = {
    id: randomUUID(),
    conferenciaId,
    unidadeId: null,
    materialId,
    localEsperadoId,
    tamanho,
    origem: 'snapshot',
    situacao: null,
    localEncontradoId: null,
    quantidadeSistema,
    quantidadeContada: null,
    diferenca: null,
    observacao: null,
    movimentacaoId: null,
    reconciliadoPor: null,
    reconciliadoEm: null,
    criadoEm: agora,
    atualizadoEm: agora,
  };
  estoqueStore.conferenciaItens.set(item.id, item);
}

function transicionar(
  id: string,
  para: 'concluida' | 'cancelada',
  usuarioId: string,
  observacao: string | null,
): Conferencia {
  const conf = exigirConferencia(id);
  if (!statusConferenciaValido(conf.status, para)) {
    throw new ConferenciaFechada(id, conf.status);
  }
  const agora = new Date();
  const atualizada: Conferencia = {
    ...conf,
    status: para,
    concluidaPor: para === 'concluida' ? usuarioId : conf.concluidaPor,
    concluidaEm: para === 'concluida' ? agora : conf.concluidaEm,
    observacao: observacao ?? conf.observacao,
    atualizadaEm: agora,
  };
  estoqueStore.conferencias.set(id, atualizada);
  return atualizada;
}

function resumir(itens: ConferenciaItem[]): ResumoDivergencias {
  const porSituacao: Record<SituacaoItem, number> = {
    pendente: 0,
    conferido: 0,
    nao_encontrado: 0,
    encontrado_em_outro_local: 0,
  };
  let contados = 0;
  let naoContados = 0;
  let divergentes = 0;
  let reconciliados = 0;
  let pendentesReconciliacao = 0;

  for (const item of itens) {
    if (item.situacao) porSituacao[item.situacao] += 1;
    const contado = item.unidadeId
      ? item.situacao !== null && item.situacao !== 'pendente'
      : item.quantidadeContada !== null;
    if (contado) contados += 1;
    else naoContados += 1;

    const div = calcularDivergencia(item);
    if (div.divergente) {
      divergentes += 1;
      if (item.reconciliadoEm === null) pendentesReconciliacao += 1;
    }
    if (item.reconciliadoEm !== null) reconciliados += 1;
  }

  return {
    totalItens: itens.length,
    contados,
    naoContados,
    divergentes,
    reconciliados,
    pendentesReconciliacao,
    porSituacao,
  };
}
