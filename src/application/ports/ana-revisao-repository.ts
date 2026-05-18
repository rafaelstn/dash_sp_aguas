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

  /**
   * Busca o match sugerido (heurística PostGIS + similaridade) registrado
   * pra uma estação ANA dentro do lote. Retorna null se a estação não
   * existe ou não tem sugestão. Usado pela rota POST /aceitar-match.
   */
  obterSugestaoMatch(
    loteId: string,
    codigoAna: string,
  ): Promise<{
    estacaoId: string;
    matchSugeridoPostoId: string;
    prefixoSugerido: string;
  } | null>;

  /**
   * Contagem de estações pendentes/em_revisao que casam com um pattern
   * de cenário ANA nas colunas de observação. Usado pelos chips de
   * filtro na tela de listagem. Espera o pattern já formatado pra
   * `ILIKE` (com `%`).
   */
  contarPorCenario(loteId: string, pattern: string): Promise<number>;

  /**
   * Detalhe do match sugerido para mostrar na tela de revisão (prefixo,
   * nome, município, confiança qualitativa e score 0..1). Retorna null
   * quando a estação não tem sugestão ou o posto sugerido foi removido.
   */
  detalheSugestaoMatch(
    estacaoId: string,
  ): Promise<{
    prefixo: string;
    nome: string | null;
    municipio: string | null;
    confianca: 'alta' | 'media' | 'baixa';
    score: number;
  } | null>;

  /**
   * Vincula a estação ao posto sugerido e marca como revisada. Atualiza
   * `posto_id`, `match_tipo='manual'`, `status='revisada'`, e grava
   * evento no audit trail (`ana_revisao_evento`). Atômica.
   */
  aceitarMatch(
    estacaoId: string,
    postoIdSugerido: string,
    prefixoSugerido: string,
    ator: ContextoAtor,
  ): Promise<void>;
}
