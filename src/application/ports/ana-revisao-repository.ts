import type {
  AcaoBulkAna,
  AnaRevisaoEstacao,
  AnaRevisaoLote,
  ContextoAtor,
  FiltrosListaAnaRevisao,
  ListaAnaRevisao,
  ResumoPainelAna,
  StatusRevisao,
} from '@/domain/ana-revisao';

/**
 * Port do módulo Inventário ANA (Meta I.6 PROGESTÃO).
 *
 * O fluxo é todo orientado a lote: cada planilha de dúvidas vira um lote;
 * estações são linhas do lote; correções vivem em JSONB sem tocar `postos`
 * até promoção explícita.
 */
export interface AnaRevisaoRepository {
  /** Lote mais recente, normalmente o ciclo atual do PROGESTÃO. */
  loteAtual(): Promise<AnaRevisaoLote | null>;

  /** KPIs para o painel + sidenav badge. */
  resumoPainel(loteId: string): Promise<ResumoPainelAna>;

  /** Lista paginada de estações com filtros. */
  listar(
    loteId: string,
    filtros: FiltrosListaAnaRevisao,
  ): Promise<ListaAnaRevisao>;

  /** Detalhe por código ANA dentro do lote. */
  obterPorCodigo(
    loteId: string,
    codigoAna: string,
  ): Promise<AnaRevisaoEstacao | null>;

  /**
   * Muda status de uma estação ANA. Grava audit trail.
   *
   * Após a FASE 5 (ADR-0011), correcoes JSONB foi removido. A verdade
   * agora vive em postos (via PATCH /api/postos/[prefixo]). Esta função
   * só atualiza o workflow (status) e adiciona observação ao audit.
   */
  aplicarRevisao(
    estacaoId: string,
    payload: {
      observacao?: string | null;
      novoStatus: StatusRevisao;
    },
    ator: ContextoAtor,
  ): Promise<AnaRevisaoEstacao>;

  /** Ação em lote sobre várias estações. Devolve quantas foram aplicadas. */
  aplicarBulk(
    loteId: string,
    acao: AcaoBulkAna,
    ator: ContextoAtor,
  ): Promise<{ aplicadas: number; falhadas: number }>;
}
