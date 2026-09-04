import type {
  CriterioDiario,
  SerieMedicao,
  UnidadeSerie,
} from '@/domain/monitor/serie-medicao';

/**
 * Port das SÉRIES HISTÓRICAS de medição de um posto.
 *
 * Contrato que a tela do Monitor consome sem saber de onde o dado vem. Hoje o
 * adaptador é `db/series-medicao-repository.mssql.ts`, lendo AO VIVO o `Dbfch`
 * do órgão (ADR-0023: nada é copiado, espelhado ou cacheado). Amanhã, se o
 * órgão publicar uma API, entra um `.api.ts` e nada acima muda.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * O DESENHO É GOVERNADO POR UM NÚMERO: 41.002
 * ─────────────────────────────────────────────────────────────────────────
 * É quanto o posto `E3-036` (LUZ) tem de leituras de chuva, de 1888 a 2004. O
 * pior caso somando as cinco séries é `F383C5B5` com 78.978. Abrir a ficha
 * carregando isso é inviável, e foi por isso que o proprietário pediu, com
 * estas palavras: "caso eu queira carregar todas as medições do dia eu consiga,
 * mas ela não precisa abrir de cara para não pesar o processamento".
 *
 * Daí a porta ter TRÊS operações e não uma:
 *
 *   `resumoPorPosto`  abre de cara. Não traz leitura nenhuma: traz quantas há,
 *                     de quando até quando, e o que está furado. MEDIDO entre
 *                     35 ms e 289 ms, incluindo o pior posto de cada série.
 *   `listarLeituras`  só depois de a pessoa escolher a janela. Paginada.
 *   `agregarPorDia`   o resumo diário daquela janela, que é o que dá para
 *                     comparar com o SIBH.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * O QUE NÃO É RESPONSABILIDADE DESTA PORTA
 * ─────────────────────────────────────────────────────────────────────────
 * Cruzar com o SIBH. A regra do ADR-0023 é que os dois armazenamentos nunca se
 * encontram numa consulta, e aqui a proibição vai além: o SIBH nem banco é. O
 * cruzamento acontece em TypeScript, no caso de uso
 * `use-cases/monitor/comparar-serie-com-sibh.ts`, com esta porta de um lado e
 * o `SibhGateway` do outro.
 */

/**
 * Retrato barato de UMA série num posto. É o que a tela abre.
 *
 * Toda contagem aqui é sobre linhas com `Excluido = 0`, sem exceção.
 */
export interface ResumoSerie {
  readonly serie: SerieMedicao;
  /** Texto de tela, vindo do catálogo de domínio. */
  readonly rotulo: string;
  readonly unidade: UnidadeSerie;
  /** `true` enquanto o órgão não confirmar a unidade. A tela deve dizer isso. */
  readonly unidadeInferida: boolean;
  readonly criterioDiario: CriterioDiario;

  /** Total de leituras da série neste posto. Zero significa "não há série". */
  readonly leituras: number;

  /**
   * Primeira e última data com leitura, em 'YYYY-MM-DD'. `null` quando não há
   * leitura, e é o único caso em que são nulas.
   *
   * As duas IGNORAM leitura com data no futuro, de propósito. MEDIDO: a chuva
   * manual tem 30 linhas futuras (todas do posto `B6-026`, até 30/11/2026) e o
   * registrador tem 12 (até 2052). São pontuais diante de 27 milhões, e mesmo
   * assim envenenam qualquer `MAX(Data)`: sem este cuidado a ficha do `B6-026`
   * anunciaria série "até novembro de 2026" numa base que parou em 2025.
   */
  readonly primeiraData: string | null;
  readonly ultimaData: string | null;

  /**
   * Quantas leituras têm data no futuro. Não some com elas em silêncio: some
   * é o que faz dado sujo virar dado invisível. A tela mostra o número.
   */
  readonly leiturasComDataFutura: number;

  /**
   * Quantas leituras trazem o valor sentinela, isto é, quantas dizem "não
   * houve leitura neste dia". Ver `domain/monitor/serie-medicao.ts`.
   *
   * Importa por posto, e não só no total: MEDIDO, a sentinela da cota é 34,7%
   * da base inteira e apenas 0,05% no posto `E6B5FA00`. Um número global não
   * responderia nada sobre o posto que está na tela.
   */
  readonly leiturasSemValor: number;
}

/** Janela de consulta. `ate` é INCLUSIVO no dia. */
export interface JanelaPeriodo {
  readonly desde: Date;
  readonly ate: Date;
}

/** Página pedida. `pagina` começa em 1. */
export interface Paginacao {
  readonly pagina: number;
  readonly porPagina: number;
}

/** Uma leitura, como está na origem. */
export interface LeituraSerie {
  /** Momento da leitura em ISO 8601 UTC. */
  readonly momento: string;
  /**
   * Valor exibível na unidade da série, ou `null` quando a origem gravou o
   * valor sentinela. NUNCA convertido de unidade.
   */
  readonly valor: number | null;
  /**
   * Valor exatamente como está na coluna, inclusive quando é sentinela.
   *
   * Existe para uma finalidade só: quem confere o dado com o órgão precisa ver
   * o que está gravado lá, e não a nossa interpretação. Sem isto, "o sistema
   * não mostra a leitura" e "a leitura não existe" viram a mesma frase.
   */
  readonly bruto: number | null;
  /**
   * Coluna `Validacao` da origem, entregue CRUA, sem interpretação e sem
   * filtro. O porquê está no adaptador: em resumo, o significado dela não é
   * público e filtrar por um significado suposto descartaria 99,9% da cota.
   */
  readonly validacao: number | null;
  /**
   * Vazão em m³/s, só na série `cota_rio`, e `null` nas outras. Também `null`
   * quando a origem gravou a sentinela de vazão.
   */
  readonly vazaoM3s: number | null;
}

export interface PaginaLeituras {
  /** Total de leituras na janela, para a paginação da tela. */
  readonly total: number;
  readonly itens: readonly LeituraSerie[];
}

/** Um dia resumido da série. */
export interface DiaDaSerie {
  /** Dia de calendário em 'YYYY-MM-DD'. */
  readonly dia: string;
  /**
   * Valor do dia pelo critério da série (`soma` para chuva, `media` para
   * nível), calculado APENAS sobre leituras com valor. `null` quando todas as
   * leituras do dia eram sentinela, que é diferente de zero.
   */
  readonly valor: number | null;
  /** Total de leituras do dia, inclusive as sentinela. */
  readonly leituras: number;
  /**
   * Quantas daquelas leituras eram sentinela. Quando este número é igual a
   * `leituras`, o dia existe na origem e não tem medida: é o caso que não pode
   * virar zero na tela.
   */
  readonly leiturasSemValor: number;
  /** Menor e maior valor do dia. `null` pelo mesmo motivo de `valor`. */
  readonly minimo: number | null;
  readonly maximo: number | null;
}

/**
 * Acesso somente leitura às séries históricas de um posto.
 *
 * Todos os métodos recebem o PREFIXO do posto, e não o identificador interno da
 * origem: o identificador do órgão é `uniqueidentifier` e vazá-lo pela porta
 * amarraria a camada de cima ao SQL Server, que é o acoplamento que o ADR-0023
 * existe para impedir.
 */
export interface SeriesMedicaoRepository {
  /**
   * Retrato das CINCO séries do posto, sem carregar leitura nenhuma.
   *
   * Devolve sempre as cinco, inclusive as que têm zero leitura, e é deliberado:
   * omitir a série vazia faria a tela não distinguir "este posto não mede rio"
   * de "não conseguimos consultar o rio". As duas frases pedem ação diferente.
   *
   * `null` quando o prefixo não corresponde a posto ativo no cadastro do órgão.
   */
  resumoPorPosto(prefixo: string): Promise<readonly ResumoSerie[] | null>;

  /**
   * Página de leituras de UMA série, dentro da janela, ordenadas por momento
   * crescente. Sem janela não há consulta: a porta não oferece "traga tudo".
   */
  listarLeituras(
    prefixo: string,
    serie: SerieMedicao,
    janela: JanelaPeriodo,
    paginacao: Paginacao,
  ): Promise<PaginaLeituras>;

  /**
   * Resumo diário de UMA série dentro da janela, ordenado por dia crescente.
   *
   * Só devolve dia que EXISTE na origem: dia sem nenhuma linha não vira zero
   * nem entra na lista. Preencher lacuna com zero transformaria ausência de
   * medição em medição de ausência, e num histórico de chuva isso é a diferença
   * entre "não sabemos" e "não choveu".
   */
  agregarPorDia(
    prefixo: string,
    serie: SerieMedicao,
    janela: JanelaPeriodo,
  ): Promise<readonly DiaDaSerie[]>;
}
