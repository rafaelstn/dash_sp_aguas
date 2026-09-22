/**
 * Séries históricas de medição do banco do órgão (`Dbfch`).
 *
 * Domínio puro: nenhum I/O, nenhuma dependência de infraestrutura. Aqui moram
 * as decisões que a MEDIÇÃO de 03/09/2026 impôs, e que valem igual em qualquer
 * adaptador que venha a implementar a porta.
 *
 * O catálogo de origem está em `docs/arquitetura/series-de-medicao-dbfch-e-sibh.md`.
 * Este arquivo não repete o catálogo: ele guarda o que vira comportamento.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * A DECISÃO QUE GOVERNA TUDO: VALOR SENTINELA
 * ─────────────────────────────────────────────────────────────────────────
 * As três séries que exibem número guardam "não houve leitura" como um NÚMERO,
 * e não como nulo. MEDIDO em 03/09/2026, contra a base inteira:
 *
 *   `CotaEscalaFluviometricas.Valor = 9999`   -> 3.815.515 de 10.986.575 (34,7%)
 *   `MedicaoPluviometricas.Medicao = 999.9`   ->   257.191 de 27.280.208 ( 0,9%)
 *   `MedicaoLoggerPluviograficas.Medicao = 999.9` ->      609
 *   `CotaEscalaFluviometricas.VazaoMainframe = 99999.999` -> 1.996.948 (18,2%)
 *
 * Que são sentinela, e não leitura, está medido pelo salto: em `Valor` o
 * segundo valor mais frequente acima de 9.000 é `9998`, com SEIS ocorrências,
 * contra 3,8 milhões do `9999`. Em `Medicao`, o vizinho `999` aparece TRÊS
 * vezes contra 257 mil. Nenhum dos dois é teto de tipo (`decimal(6,1)` chega a
 * 99999,9 e `int` a bilhões), então o valor foi escolhido, não truncado.
 *
 * **Somar ou mediar sentinela produz número que parece resposta.** Um mês de
 * chuva com dez dias sem leitura viraria 9.999 mm; a cota média de um posto com
 * um terço da série sem leitura viraria 99 metros. É exatamente a categoria de
 * defeito que este projeto já pagou uma vez: o painel que devolvia zero e
 * passava por 875 testes.
 *
 * Por isso sentinela vira `null` E é CONTADA. Descartar em silêncio seria o
 * mesmo defeito com outro sinal: a tela mostraria trinta dias de série onde só
 * houve dez leituras, sem nada dizendo que os outros vinte não existem.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * A UNIDADE DE COTA E PIEZÔMETRO É INFERÊNCIA, E POR ISSO NADA É CONVERTIDO
 * ─────────────────────────────────────────────────────────────────────────
 * O órgão não publica a unidade dessas colunas, e o ADR-0023 §12 registra que
 * perguntar a eles é o caminho. A inferência de centímetro vem da distribuição
 * MEDIDA, com a sentinela fora:
 *
 *   cota, posto E6B5FA00 (70.068 leituras): p10 = 372, mediana = 423, p90 = 530
 *   piezômetro manual, posto C132083D:      p10 = 683, mediana = 738, p90 = 784
 *   piezômetro eletrônico, posto E65836CC:  p10 = 404, mediana = 501, p90 = 709
 *
 * Lidos como centímetros dão 3,7 m a 5,3 m de cota de régua e 6,8 m a 7,8 m de
 * profundidade de lençol, que são faixas plausíveis. Lidos como metros dariam
 * 423 metros de coluna d'água, que não existe.
 *
 * A consequência prática é a regra: **o valor é entregue como está, sem
 * conversão.** Se o órgão responder que a unidade é outra, muda o rótulo, e
 * rótulo errado se corrige numa linha. Valor convertido errado se corrige
 * depois de alguém já ter tomado decisão em cima dele.
 */

/** As seis séries de medição ligadas ao posto por `PostoId`. */
export type SerieMedicao =
  | 'chuva_manual'
  | 'chuva_logger'
  | 'cota_rio'
  | 'piezo_manual'
  | 'piezo_eletronico'
  | 'vazao_rio';

/**
 * Grandeza física, que decide como o dia se agrega.
 *
 * `vazao` é grandeza instantânea como o nível (média do dia), mas é separada
 * dele porque não tem equivalente no SIBH e porque a unidade não é inferida.
 */
export type GrandezaSerie = 'chuva' | 'nivel' | 'vazao';

/**
 * Unidade em que o valor é entregue, SEM conversão.
 *
 * `mm` está confirmada pela própria natureza da tabela pluviométrica.
 * `cm` é inferência medida (ver o cabeçalho), e por isso o resumo carrega
 * `unidadeInferida`, para que a tela possa dizer isso a quem lê.
 */
export type UnidadeSerie = 'mm' | 'cm' | 'm3/s';

/**
 * Como o dia se resume.
 *
 * `soma` para chuva, porque chuva é grandeza ACUMULÁVEL: a soma do dia é o
 * total que caiu no dia, e é o número que o meteorologista usa.
 *
 * `media` para cota e piezômetro, porque nível é grandeza INSTANTÂNEA: somar
 * duas leituras de cota do mesmo dia produz um número sem significado físico
 * nenhum (dois metros de manhã mais dois à tarde não são quatro metros de rio).
 * A média vem acompanhada de mínimo e máximo do dia, que é o que revela a
 * cheia que a média esconde.
 *
 * Esta é exatamente a regra que o projeto já aplica ao nível vindo do SIBH em
 * `use-cases/monitor/obter-serie-nivel.ts` (média, mínimo e máximo por dia de
 * calendário). Divergir aqui tornaria o comparativo entre as duas fontes uma
 * comparação entre critérios diferentes, que é a divergência de método que o
 * catálogo alerta em §2.1.
 */
export type CriterioDiario = 'soma' | 'media';

export interface DefinicaoSerie {
  readonly serie: SerieMedicao;
  /** Texto de tela, em PT-BR. */
  readonly rotulo: string;
  readonly grandeza: GrandezaSerie;
  readonly unidade: UnidadeSerie;
  /** `true` enquanto o órgão não confirmar a unidade (ADR-0023 §12). */
  readonly unidadeInferida: boolean;
  readonly criterioDiario: CriterioDiario;
  /**
   * Valor que a origem usa para dizer "não houve leitura". `null` quando a
   * série não tem sentinela medida.
   */
  readonly valorSentinela: number | null;
  readonly origem: 'manual' | 'automatica';
}

/**
 * Catálogo das seis séries. Fonte única: adaptador, caso de uso e tela leem
 * daqui, para que rótulo, unidade e critério não divirjam entre camadas.
 *
 * As duas séries de piezômetro NÃO são a mesma série com origens diferentes, e
 * juntá-las seria erro de dado: MEDIDO, a manual vai de 0 a 41.500 (`int`) e a
 * eletrônica de -3 a 1.033 (`decimal(7,1)`). Ordens de grandeza distintas na
 * mesma unidade declarada significam que pelo menos uma das duas não está na
 * unidade que a outra está, e emendar as duas num gráfico só produziria um
 * degrau que ninguém saberia explicar.
 */
export const SERIES_MEDICAO: Readonly<Record<SerieMedicao, DefinicaoSerie>> = {
  chuva_manual: {
    serie: 'chuva_manual',
    rotulo: 'Chuva (leitura manual)',
    grandeza: 'chuva',
    unidade: 'mm',
    unidadeInferida: false,
    criterioDiario: 'soma',
    valorSentinela: 999.9,
    origem: 'manual',
  },
  chuva_logger: {
    serie: 'chuva_logger',
    rotulo: 'Chuva (registrador automático)',
    grandeza: 'chuva',
    unidade: 'mm',
    unidadeInferida: false,
    criterioDiario: 'soma',
    valorSentinela: 999.9,
    origem: 'automatica',
  },
  cota_rio: {
    serie: 'cota_rio',
    rotulo: 'Cota do rio (régua)',
    grandeza: 'nivel',
    unidade: 'cm',
    unidadeInferida: true,
    criterioDiario: 'media',
    valorSentinela: 9999,
    origem: 'manual',
  },
  piezo_manual: {
    serie: 'piezo_manual',
    rotulo: 'Piezômetro (leitura manual)',
    grandeza: 'nivel',
    unidade: 'cm',
    unidadeInferida: true,
    criterioDiario: 'media',
    // Nenhuma sentinela apareceu na medição do topo da faixa: os dez valores
    // mais frequentes acima de 9.000 aparecem de 3 a 6 vezes cada, sem salto.
    valorSentinela: null,
    origem: 'manual',
  },
  piezo_eletronico: {
    serie: 'piezo_eletronico',
    rotulo: 'Piezômetro (registrador eletrônico)',
    grandeza: 'nivel',
    unidade: 'cm',
    unidadeInferida: true,
    criterioDiario: 'media',
    valorSentinela: null,
    origem: 'automatica',
  },
  /**
   * Vazão calculada pelo órgão e gravada na MESMA linha da cota
   * (`CotaEscalaFluviometricas.VazaoMainframe`), por isso é uma série do posto
   * fluviométrico e não uma tabela própria.
   *
   * MEDIDO em 17/09/2026: 10.986.575 linhas, 99.203 nulas, 1.996.948 com a
   * sentinela e 8.890.424 com vazão. A última vazão gravada é de 31/12/2023;
   * de 2024 em diante as linhas de cota chegam com a vazão nula. A linha nula é
   * cota sem vazão calculada, e não leitura de vazão faltando: o adaptador a
   * deixa fora da série, e a sentinela segue a regra geral (conta como leitura
   * sem valor).
   */
  vazao_rio: {
    serie: 'vazao_rio',
    rotulo: 'Vazão do rio',
    grandeza: 'vazao',
    unidade: 'm3/s',
    unidadeInferida: false,
    criterioDiario: 'media',
    valorSentinela: 99999.999,
    origem: 'manual',
  },
};

/** As seis séries na ordem em que a tela as apresenta. */
export const TODAS_AS_SERIES: readonly SerieMedicao[] = [
  'chuva_manual',
  'chuva_logger',
  'cota_rio',
  'vazao_rio',
  'piezo_manual',
  'piezo_eletronico',
];

/** `true` quando o texto é uma das seis séries. Usado na fronteira HTTP. */
export function eSerieMedicao(valor: string): valor is SerieMedicao {
  return (TODAS_AS_SERIES as readonly string[]).includes(valor);
}

/**
 * Sentinela da vazão em `CotaEscalaFluviometricas.VazaoMainframe`.
 *
 * MEDIDO: 1.996.948 de 10.986.575 linhas (18,2%) trazem exatamente este valor,
 * contra 99.203 nulas e zero em `0`. Cem mil metros cúbicos por segundo é cinco
 * vezes a vazão média do rio Amazonas: não é leitura, é marcador.
 */
export const VAZAO_SEM_LEITURA = 99999.999;

/**
 * Converte o valor cru da origem no valor exibível, ou `null` quando a origem
 * está dizendo "não houve leitura".
 *
 * A comparação de sentinela é feita com tolerância porque o driver entrega
 * `decimal` como número de ponto flutuante, e igualdade exata sobre float é
 * armadilha conhecida: `999.9` chega como 999.9000000000001 em alguns
 * caminhos. A tolerância de meio centésimo é menor que a resolução da própria
 * coluna (`decimal(6,1)`), então ela não pode capturar uma leitura vizinha.
 */
export function valorUtil(serie: SerieMedicao, bruto: number | null): number | null {
  if (serie === 'vazao_rio') return vazaoUtil(bruto);
  if (bruto === null || !Number.isFinite(bruto)) return null;
  const sentinela = SERIES_MEDICAO[serie].valorSentinela;
  if (sentinela !== null && Math.abs(bruto - sentinela) < 0.005) return null;
  return bruto;
}

/**
 * Mesma regra para a vazão. A tolerância é menor porque a coluna tem três
 * casas decimais (`99999.998` é leitura).
 */
export function vazaoUtil(bruto: number | null): number | null {
  if (bruto === null || !Number.isFinite(bruto)) return null;
  if (Math.abs(bruto - VAZAO_SEM_LEITURA) < 0.0005) return null;
  return bruto;
}
