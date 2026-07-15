import type {
  AbrirConferenciaComando,
  Conferencia,
  ConferenciaItem,
  ContagemComando,
  FiltrosConferencia,
  FiltrosItemConferencia,
  ResultadoReconciliacao,
  ResumoDivergencias,
  SobraComando,
} from '@/domain/estoque/conferencia';

/**
 * Port do repositorio de conferencia fisica (inventario, ADR 0021).
 *
 * `abrir` cria a sessao E o snapshot congelado numa unica transacao
 * (`INSERT ... SELECT` no `.pg`): serializado -> unidades ativas/defeito no
 * escopo; quantificavel -> saldos positivos com `quantidade_sistema` congelada.
 * Impede duas sessoes abertas no mesmo escopo (indice unico parcial ->
 * `EscopoConferenciaEmAberto`).
 *
 * `reconciliarItem` roda numa unica `sql.begin` (`.pg`): trava o item
 * (`FOR UPDATE`), guarda de idempotencia (`reconciliado_em`/`movimentacao_id` ja
 * setados -> no-op), gera a movimentacao pelo mapeamento reusando
 * `aplicarMovimentacaoNaTx` na MESMA transacao e carimba o item. Avisa quando a
 * base mudou durante a contagem (`aviso: 'base_alterada'`).
 *
 * Adapter `.pg` persiste (0062/0063/0064); `.mock` replica a mesma logica/erros
 * em memoria (MODO DEMO e teste de use-case).
 */
export interface EstoqueConferenciasRepository {
  /** Abre a sessao + snapshot congelado (transacional). Lanca `EscopoConferenciaEmAberto`. */
  abrir(comando: AbrirConferenciaComando): Promise<Conferencia>;

  listar(filtros: FiltrosConferencia): Promise<{ itens: Conferencia[]; total: number }>;
  obterPorId(id: string): Promise<Conferencia | null>;

  /** Contagens agregadas para o resumo de divergencias. Lanca `ConferenciaNaoEncontrada`. */
  resumoDivergencias(id: string): Promise<ResumoDivergencias>;

  listarItens(
    conferenciaId: string,
    filtros: FiltrosItemConferencia,
  ): Promise<{ itens: ConferenciaItem[]; total: number }>;

  /**
   * Busca 1 item validando que pertence a conferencia do path (guarda de IDOR:
   * `WHERE id = :itemId AND conferencia_id = :conferenciaId`). Null se nao existir
   * ou nao pertencer.
   */
  obterItem(conferenciaId: string, itemId: string): Promise<ConferenciaItem | null>;

  /**
   * Registra/atualiza a contagem de 1 item (so com a sessao `aberta`). Lanca
   * `ItemConferenciaNaoEncontrado`, `ConferenciaFechada`, `NaturezaIncompativel`.
   */
  registrarContagem(
    conferenciaId: string,
    itemId: string,
    contagem: ContagemComando,
    usuarioId: string,
  ): Promise<ConferenciaItem>;

  /**
   * Adiciona um item "sobra" (alvo JA cadastrado; so com a sessao `aberta`).
   * Lanca `ConferenciaFechada`, `UnidadeNaoEncontrada`/`MaterialNaoEncontrado`,
   * `NaturezaIncompativel`.
   */
  adicionarSobra(
    conferenciaId: string,
    sobra: SobraComando,
    usuarioId: string,
  ): Promise<ConferenciaItem>;

  /** Conclui a sessao (aberta -> concluida). Lanca `ConferenciaNaoEncontrada`/`ConferenciaFechada`. */
  concluir(id: string, usuarioId: string, observacao: string | null): Promise<Conferencia>;
  /** Cancela a sessao (aberta -> cancelada). */
  cancelar(id: string, usuarioId: string, observacao: string | null): Promise<Conferencia>;

  /**
   * Reconcilia 1 item: atomico (`sql.begin`) e idempotente (`reconciliado_em`).
   * Gera a movimentacao pelo mapeamento (reusa `aplicarMovimentacaoNaTx` no MESMO
   * `tx`) e carimba o item. So com a sessao `concluida` (`ConferenciaNaoConcluida`).
   */
  reconciliarItem(
    conferenciaId: string,
    itemId: string,
    usuarioId: string,
  ): Promise<ResultadoReconciliacao>;
}
