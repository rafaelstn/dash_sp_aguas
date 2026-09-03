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

/* ──────────────────────────────────────────────────────────────────────────
 * AS DUAS METADES DO PAINEL
 *
 * Desde o ADR-0023 o painel não tem uma origem só. O CADASTRO de posto mora no
 * SQL Server do órgão (`Dbfch`) e o que é NOSSO (arquivos indexados, órfãos,
 * trilha de acesso, lotes de indexação) mora no nosso PostgreSQL. O ADR proíbe
 * junção entre os dois armazenamentos, então cada número é resolvido inteiro na
 * origem que o possui e a ARITMÉTICA que cruza os dois lados acontece em
 * TypeScript, no compositor (`painel-repository.composto.ts`).
 *
 * As duas portas abaixo existem para que essa divisão seja um CONTRATO, e não
 * uma convenção: nenhum adaptador consegue implementar metade da outra sem que
 * isso apareça no tipo. `PainelRepository` continua intacto, e por isso a
 * página do painel não muda uma linha.
 * ────────────────────────────────────────────────────────────────────────── */

/** Contagens que só a origem do cadastro sabe responder. */
export interface ResumoCadastroPostos {
  totalPostos: number;
  postosComCoordenadas: number;
  postosComTelemetria: number;
  /**
   * Postos com prefixo ou código ANA fora do padrão.
   *
   * Fica na metade CADASTRAL, e não na nossa, porque é derivação pura do
   * prefixo do posto: quem muda de origem leva a derivação junto. Adaptador
   * cuja origem não sabe classificar devolve zero e escreve o motivo.
   */
  desconformidadesPostos: number;
}

/**
 * A metade CADASTRAL do painel: tudo que se responde lendo a origem do
 * cadastro de posto, e nada além disso.
 */
export interface PainelCadastroRepository {
  /**
   * A origem registra a data de criação da linha de posto?
   *
   * Governa as séries de "total de postos" e "postos sem arquivo": as duas são
   * cumulativas sobre a POPULAÇÃO de postos, então sem data de criação elas não
   * existem. `Dbfch` não tem coluna de criação nem de atualização (ADR §10.7).
   *
   * É propriedade declarada do adaptador, e não parâmetro de fiação, porque
   * fiação errada é silenciosa: o sintoma seria um sparkline de uma população
   * desenhado embaixo do número de outra, e nada quebraria.
   */
  readonly temHistoricoDeCadastro: boolean;
  resumoCadastro(): Promise<ResumoCadastroPostos>;
  distribuicaoPorTipo(): Promise<DistribuicaoTipo[]>;
  rankingUGRHI(): Promise<RankingUGRHI[]>;
  classesDesconformidade(): Promise<ClasseDesconformidade[]>;
  statusOperacional(): Promise<StatusOperacional>;
  rankingMantenedores(limite?: number): Promise<RankingMantenedor[]>;
}

/** A metade NOSSA: indexação de arquivo, órfãos e trilha, sempre no PostgreSQL. */
export interface PainelOperacaoRepository {
  /** Postos distintos que já têm ao menos um arquivo indexado. */
  postosComArquivos(): Promise<number>;
  arquivosOrfaos(): Promise<number>;
  /**
   * As três séries temporais. O compositor descarta as duas cadastrais quando
   * o cadastro vem de origem sem histórico — ver `temHistoricoDeCadastro`.
   */
  tendencias(): Promise<ResumoPendencias['tendencias']>;
  atividadeRecente(): Promise<AtividadeRecente>;
}
