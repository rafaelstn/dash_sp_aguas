import type { EstoqueConferenciasRepository } from '@/application/ports/estoque-conferencias-repository';
import type { ResultadoReconciliacao } from '@/domain/estoque/conferencia';
import {
  ConferenciaNaoConcluida,
  ConferenciaNaoEncontrada,
  ItemConferenciaNaoEncontrado,
} from '@/domain/errors';

/**
 * Reconcilia 1 item: idempotente e atomico no repositorio (FOR UPDATE + guarda
 * de `reconciliado_em` + `aplicarMovimentacaoNaTx` na mesma transacao). O
 * use-case so delega; a decisao humana (qual item tratar) ja veio da rota.
 */
export async function reconciliarItem(
  repo: EstoqueConferenciasRepository,
  conferenciaId: string,
  itemId: string,
  usuarioId: string,
): Promise<ResultadoReconciliacao> {
  return repo.reconciliarItem(conferenciaId, itemId, usuarioId);
}

/** Resultado por item no lote (partial success: um item ruim nao derruba o resto). */
export interface ItemLoteResultado {
  itemId: string;
  sucesso: boolean;
  movimentacaoId?: string | null;
  aviso?: 'base_alterada' | null;
  jaReconciliado?: boolean;
  /** Preenchido quando o item falhou (nome do erro de dominio). */
  erro?: string;
}

export interface ResultadoLote {
  conferenciaId: string;
  total: number;
  reconciliados: number;
  falhas: number;
  itens: ItemLoteResultado[];
}

/**
 * Reconcilia em LOTE os itens revisados pelo almoxarife. Itera o MESMO apply
 * transacional idempotente por item (cada um individualmente atomico e trilhado);
 * nao e um caminho paralelo. Pre-condicoes de sessao (existe, concluida) sao
 * checadas UMA vez e valem para o lote inteiro (409 antes de iterar). Ja um item
 * ruim (ex.: SaldoInsuficiente, item de outra conferencia) NAO derruba os demais:
 * cai como falha daquele item (governo: reportar por item, nao mascarar).
 */
export async function reconciliarLote(
  repo: EstoqueConferenciasRepository,
  conferenciaId: string,
  itemIds: string[],
  usuarioId: string,
): Promise<ResultadoLote> {
  const conf = await repo.obterPorId(conferenciaId);
  if (!conf) throw new ConferenciaNaoEncontrada(conferenciaId);
  if (conf.status !== 'concluida') {
    throw new ConferenciaNaoConcluida(conferenciaId, conf.status);
  }

  // Deduplica preservando a ordem (o mesmo id duas vezes no lote e no-op na 2a
  // pela idempotencia, mas evitamos o round-trip).
  const ids = Array.from(new Set(itemIds));
  const itens: ItemLoteResultado[] = [];
  let reconciliados = 0;
  let falhas = 0;

  for (const itemId of ids) {
    try {
      const r = await repo.reconciliarItem(conferenciaId, itemId, usuarioId);
      itens.push({
        itemId,
        sucesso: true,
        movimentacaoId: r.movimentacaoId,
        aviso: r.aviso,
        jaReconciliado: r.jaReconciliado,
      });
      reconciliados += 1;
    } catch (e) {
      // Item nao pertence a conferencia / nao existe, ou regra de estoque barrou
      // (SaldoInsuficiente, TransicaoStatusInvalida). Reporta e segue. Erro
      // inesperado (nao de dominio) propaga e aborta o lote.
      if (e instanceof ItemConferenciaNaoEncontrado || ehErroDeReconciliacao(e)) {
        itens.push({
          itemId,
          sucesso: false,
          erro: e instanceof Error ? e.name : 'erro_desconhecido',
        });
        falhas += 1;
        continue;
      }
      throw e;
    }
  }

  return { conferenciaId, total: ids.length, reconciliados, falhas, itens };
}

/** Erros de dominio "esperados" na reconciliacao de um item (nao abortam o lote). */
function ehErroDeReconciliacao(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  return (
    e.name === 'SaldoInsuficiente' ||
    e.name === 'TransicaoStatusInvalida' ||
    e.name === 'NaturezaIncompativel' ||
    e.name === 'MovimentacaoInvalida' ||
    e.name === 'ItemSemDivergencia' ||
    e.name === 'LocalNaoEncontrado' ||
    // ex.: unidade que saiu de operacao depois da contagem
    e.name === 'DadosInvalidos' ||
    e.name === 'UnidadeNaoEncontrada' ||
    e.name === 'MaterialNaoEncontrado'
  );
}
