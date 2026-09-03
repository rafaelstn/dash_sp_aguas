/**
 * Port do painel (/painel).
 *
 * Agregações somente-leitura para os cards e rankings do painel. Sem domain
 * logic mutável; ainda assim o contrato mora aqui (e não no adapter `.pg`)
 * para manter a simetria com os demais repositórios da Clean Architecture.
 */

/**
 * Tendência de um KPI: valor do mesmo indicador no período anterior (para o
 * delta seta/percentual) e série curta cumulativa (para o sparkline, do mais
 * antigo ao mais recente). Ambos opcionais: só vêm preenchidos para KPIs com
 * base temporal real no banco (`created_at` / `indexado_em`). KPIs sem
 * dimensão temporal NÃO recebem tendência — não inventamos série.
 */
export interface TendenciaKPI {
  /** Valor do indicador há ~30 dias (fim do período anterior). */
  valorAnterior: number;
  /** Série cumulativa mensal (mais antigo → mais recente), tipicamente 6 pontos. */
  serie: number[];
}

export interface ResumoPendencias {
  totalPostos: number;
  postosComArquivos: number;
  postosSemArquivos: number;
  postosComCoordenadas: number;
  postosSemCoordenadas: number;
  postosComTelemetria: number;
  desconformidadesPostos: number;
  arquivosOrfaos: number;
  /**
   * Tendências dos KPIs que têm base temporal. Mapa chaveado pela métrica.
   * Ausência de chave = KPI sem série (ex: desconformidades, derivadas de
   * uma view sem timestamp; "sem coordenadas", sem data de preenchimento da
   * coordenada). Chaves possíveis:
   *   - `totalPostos`        (postos.created_at)
   *   - `postosSemArquivos`  (postos.created_at vs. distinct prefixo indexado por indexado_em)
   *   - `arquivosOrfaos`     (arquivos_orfaos.indexado_em)
   */
  tendencias: {
    totalPostos?: TendenciaKPI;
    postosSemArquivos?: TendenciaKPI;
    arquivosOrfaos?: TendenciaKPI;
  };
}

export interface DistribuicaoTipo {
  tipo: string;
  total: number;
}

export interface RankingUGRHI {
  numero: string;
  nome: string;
  total: number;
  desconformes: number;
  taxa: number;
}

export interface ClasseDesconformidade {
  tipo: 'prefixo' | 'prefixo_ana';
  classe: string;
  total: number;
}

export interface AtividadeRecente {
  ultimaIndexacao: Date | null;
  statusUltimaIndexacao: string | null;
  totalLotesIndexacao: number;
  arquivosIndexadosTotal: number;
  acessosHoje: number;
  acessos7Dias: number;
}

/**
 * Distribuição operacional dos postos (heurística de recência sobre
 * `operacao_fim_ano` — ver knowledge-base 2026-04-28).
 *   ativo      = NULL OR ano >= ano_corrente - 1
 *   desativado = ano > 0 AND ano < ano_corrente - 1
 *   indeterminado = ano = 0 (sentinela "sem dado")
 */
export interface StatusOperacional {
  ativos: number;
  desativados: number;
  indeterminados: number;
  total: number;
}

/**
 * Mantenedor — o campo `mantenedor`, mesma regra das facetas de busca.
 *
 * Somava `btl` até 03/09/2026, quando o campo saiu do domínio. Manter o ranking
 * alinhado com a busca não é cosmético: mantenedor que aparece no pódio e não
 * existe na lista de filtros é um beco sem saída para quem lê o painel.
 * Total conta postos distintos.
 */
export interface RankingMantenedor {
  nome: string;
  total: number;
  ativos: number;
}

export interface PainelRepository {
  resumoPendencias(): Promise<ResumoPendencias>;
  distribuicaoPorTipo(): Promise<DistribuicaoTipo[]>;
  rankingUGRHI(): Promise<RankingUGRHI[]>;
  classesDesconformidade(): Promise<ClasseDesconformidade[]>;
  statusOperacional(): Promise<StatusOperacional>;
  rankingMantenedores(limite?: number): Promise<RankingMantenedor[]>;
  atividadeRecente(): Promise<AtividadeRecente>;
}
