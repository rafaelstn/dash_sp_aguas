/**
 * Use-case: comparar a série histórica de um posto (banco do órgão) com a série
 * da estação correspondente no SIBH.
 *
 * É o pedido do proprietário, nas palavras dele: "abrir um posto e ver o
 * histórico de chuva, do rio e piezo e bater com a SIBH pra ver se estão
 * coerentes".
 *
 * ═════════════════════════════════════════════════════════════════════════
 * OS ESTADOS SÃO QUATRO, E NENHUM DELES PODE VIRAR O MESMO VAZIO
 * ═════════════════════════════════════════════════════════════════════════
 * Uma tela que devolvesse gráfico em branco nos quatro casos abaixo estaria
 * mentindo em três deles, e cada um pede ação diferente de quem opera:
 *
 *   `sem_correspondencia`   não existe estação do SIBH para este posto. Não há
 *                           o que comparar, e nunca haverá enquanto o órgão não
 *                           publicar a tabela de equivalência. Ação: cobrar a
 *                           tabela, não procurar defeito no sistema.
 *   `sem_dado_no_periodo`   a correspondência existe, e um dos lados (ou os
 *                           dois) não tem leitura na janela pedida. Ação: mudar
 *                           a janela. O resultado diz QUAL lado está vazio.
 *   `dado_dos_dois_lados`   os dois lados têm dado e há dia coincidente. É o
 *                           único estado que compara de fato.
 *   `origem_indisponivel`   o SIBH não respondeu. Ação: tentar de novo. Sem
 *                           este estado, uma queda do SIBH seria lida como
 *                           "não há correspondência", que é conclusão errada e
 *                           permanente sobre um problema momentâneo.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * O QUE A MEDIÇÃO DIZ QUE VAI ACONTECER NA PRÁTICA
 * ═════════════════════════════════════════════════════════════════════════
 * MEDIDO em 03/09/2026, e está no catálogo `series-de-medicao-dbfch-e-sibh.md`:
 *
 *   Das 2.701 estações do SIBH, ZERO casam com `Postos.Prefixo` e 46 casam com
 *   `Postos.PrefixoDNAEE`. São 2% de cobertura.
 *
 *   As cinco séries do órgão param em agosto de 2025 (uma em dezembro), e o
 *   SIBH entrega dado desta semana. **Não há sobreposição no tempo.**
 *
 * Ou seja: hoje este caso de uso responde `sem_correspondencia` em 98% dos
 * postos e `sem_dado_no_periodo` em quase todo o resto. Isso não é defeito, é
 * o retrato do que existe, e é exatamente o que o proprietário precisa VER na
 * tela para decidir o que pedir ao órgão. Escondê-lo atrás de um gráfico vazio
 * transformaria um achado em silêncio.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * A CONVERSÃO DE UNIDADE ACONTECE AQUI, E SÓ AQUI
 * ═════════════════════════════════════════════════════════════════════════
 * A porta de séries entrega o valor como está na origem, sem converter, porque
 * a unidade de cota e piezômetro é inferência (ver `domain/monitor/serie-medicao.ts`).
 * Comparar, porém, exige a mesma unidade nos dois lados: o SIBH entrega nível
 * em METROS e o órgão grava um inteiro que a distribuição medida lê como
 * CENTÍMETROS.
 *
 * A conversão fica confinada neste arquivo, com constante nomeada, e o
 * resultado carrega `unidadeInferida`. Assim o número comparado existe (que é
 * o que foi pedido) sem que a inferência se espalhe pelo sistema: se o órgão
 * disser que a unidade é outra, muda uma constante em um arquivo, e nenhuma
 * série guardada precisa ser recalculada, porque nenhuma foi convertida.
 *
 * Para chuva não há conversão nenhuma: os dois lados são milímetros.
 */

import type {
  DiaDaSerie,
  JanelaPeriodo,
  SeriesMedicaoRepository,
} from '@/application/ports/series-medicao-repository';
import type { EstacaoSibh, SibhGateway } from '@/application/ports/sibh-gateway';
import { agregarDiario } from '@/domain/monitor/agregacao-hidrologica';
import { agregarNivelDiario } from './obter-serie-nivel';
import { SERIES_MEDICAO, type SerieMedicao } from '@/domain/monitor/serie-medicao';

/** Centímetros por metro. Ver o cabeçalho: a conversão mora só aqui. */
const CM_POR_M = 100;

/** Posto alvo da comparação, na forma mínima que o caso de uso precisa. */
export interface PostoParaComparar {
  readonly prefixo: string;
  /** Código ANA (`Postos.PrefixoDNAEE`). É a ÚNICA chave que casa com o SIBH. */
  readonly prefixoAna: string | null;
}

/** Identificação da estação do SIBH que casou com o posto. */
export interface EstacaoCorrespondente {
  readonly prefixo: string;
  readonly nome: string;
  readonly tipo: string;
}

/** Um dia presente nos dois lados. */
export interface ParDiario {
  readonly dia: string;
  /** Valor do órgão, já na unidade da comparação. */
  readonly orgao: number;
  /** Valor do SIBH, na mesma unidade. */
  readonly sibh: number;
  /** `orgao - sibh`, arredondado a 2 casas. */
  readonly diferenca: number;
}

export type ResultadoComparativo =
  | { readonly estado: 'sem_correspondencia'; readonly motivo: MotivoSemCorrespondencia }
  | {
      readonly estado: 'sem_dado_no_periodo';
      readonly estacao: EstacaoCorrespondente;
      readonly diasNoOrgao: number;
      readonly diasNoSibh: number;
    }
  | {
      readonly estado: 'dado_dos_dois_lados';
      readonly estacao: EstacaoCorrespondente;
      readonly unidade: string;
      /** `true` quando a unidade do lado do órgão é inferida, não confirmada. */
      readonly unidadeInferida: boolean;
      readonly pares: readonly ParDiario[];
      /** Dias que existem só de um lado. Não entram na comparação. */
      readonly diasSoNoOrgao: number;
      readonly diasSoNoSibh: number;
      /** Maior diferença absoluta entre os pares. */
      readonly maiorDiferenca: number;
    }
  | { readonly estado: 'origem_indisponivel'; readonly lado: 'sibh' };

/**
 * Por que não há correspondência. A distinção importa: "este posto não tem
 * código ANA" é problema de cadastro, e "tem código e o SIBH não conhece" é
 * problema de vocabulário entre os dois sistemas. São conversas diferentes com
 * o órgão.
 */
export type MotivoSemCorrespondencia = 'posto_sem_codigo_ana' | 'codigo_ana_nao_esta_no_sibh';

/** Normaliza código para comparação: sem espaço nas pontas e em caixa alta. */
function chave(valor: string): string {
  return valor.trim().toUpperCase();
}

function duasCasas(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/**
 * Converte o valor do órgão para a unidade em que a comparação acontece.
 *
 * Chuva já está em milímetros nos dois lados. Nível vem em centímetros do lado
 * do órgão (inferência medida) e em metros do lado do SIBH.
 */
function paraUnidadeDaComparacao(serie: SerieMedicao, valor: number): number {
  return SERIES_MEDICAO[serie].grandeza === 'chuva' ? valor : valor / CM_POR_M;
}

/** Unidade em que os pares são expressos, para a tela rotular o eixo. */
function unidadeDaComparacao(serie: SerieMedicao): string {
  return SERIES_MEDICAO[serie].grandeza === 'chuva' ? 'mm' : 'm';
}

/**
 * Acha a estação do SIBH que corresponde ao posto.
 *
 * A regra é uma só: `Postos.PrefixoDNAEE` contra `EstacaoSibh.prefixo`. O
 * casamento por `Postos.Prefixo` foi MEDIDO e dá ZERO em 2.701 estações, então
 * tentá-lo não seria tolerância, seria ruído: qualquer coincidência futura
 * entre um código do SIBH e um prefixo do órgão viraria um par falso, e par
 * falso num comparativo é pior que par nenhum.
 */
export function acharEstacaoCorrespondente(
  posto: PostoParaComparar,
  estacoes: readonly EstacaoSibh[],
): EstacaoSibh | null {
  const codigo = posto.prefixoAna?.trim();
  if (!codigo) return null;
  const alvo = chave(codigo);
  return estacoes.find((e) => chave(e.prefixo) === alvo) ?? null;
}

/**
 * Cruza dois lados JÁ agregados por dia. Função pura: sem I/O, sem relógio.
 *
 * Só o dia presente nos DOIS lados vira par. Dia de um lado só é contado e não
 * comparado: emparelhá-lo com zero produziria uma diferença que parece medida e
 * é só ausência do outro lado.
 */
export function cruzarPorDia(
  serie: SerieMedicao,
  ladoOrgao: readonly DiaDaSerie[],
  ladoSibh: ReadonlyMap<string, number>,
): { pares: ParDiario[]; soNoOrgao: number; soNoSibh: number } {
  const pares: ParDiario[] = [];
  let soNoOrgao = 0;
  const diasDoOrgao = new Set<string>();

  for (const dia of ladoOrgao) {
    diasDoOrgao.add(dia.dia);
    // Dia sem medida no órgão (só sentinela) não compara: `valor` é `null` de
    // propósito, e tratá-lo como zero inventaria uma divergência inteira.
    if (dia.valor === null) {
      soNoOrgao += 1;
      continue;
    }
    const doSibh = ladoSibh.get(dia.dia);
    if (doSibh === undefined) {
      soNoOrgao += 1;
      continue;
    }
    const orgao = duasCasas(paraUnidadeDaComparacao(serie, dia.valor));
    const sibh = duasCasas(doSibh);
    pares.push({ dia: dia.dia, orgao, sibh, diferenca: duasCasas(orgao - sibh) });
  }

  let soNoSibh = 0;
  for (const dia of ladoSibh.keys()) {
    if (!diasDoOrgao.has(dia)) soNoSibh += 1;
  }

  return { pares, soNoOrgao, soNoSibh };
}

/**
 * Busca a série do SIBH no período e devolve o valor diário por dia.
 *
 * Chuva usa a agregação por dia hidrológico que o projeto já tem
 * (`agregarDiario`, 07:00 às 06:59), e nível usa a agregação por dia de
 * calendário (`agregarNivelDiario`, média do dia). São as mesmas funções que o
 * módulo Monitor já usa contra o SIBH: reimplementá-las aqui produziria duas
 * verdades sobre o mesmo dia.
 */
async function ladoDoSibh(
  sibh: SibhGateway,
  serie: SerieMedicao,
  prefixoSibh: string,
  janela: JanelaPeriodo,
): Promise<Map<string, number>> {
  const porDia = new Map<string, number>();

  if (SERIES_MEDICAO[serie].grandeza === 'chuva') {
    const medicoes = await sibh.medicoesPorPrefixo(prefixoSibh, janela.desde, janela.ate);
    for (const dia of agregarDiario(medicoes)) porDia.set(dia.data, dia.totalMm);
    return porDia;
  }

  const pontos = await sibh.serieNivelPorPrefixo(prefixoSibh, janela.desde, janela.ate);
  for (const dia of agregarNivelDiario(pontos)) {
    // `agregarNivelDiario` rotula o dia como ISO da meia-noite UTC; a porta de
    // séries rotula como 'YYYY-MM-DD'. O corte alinha os dois vocabulários num
    // ponto só, em vez de espalhar `slice(0, 10)` por quem consome.
    porDia.set(dia.momento.slice(0, 10), dia.nivelMedioM);
  }
  return porDia;
}

/**
 * Compara a série do posto no órgão com a do SIBH, no período pedido.
 *
 * Tolerante a falha do SIBH: nunca estoura por causa dele, devolve
 * `origem_indisponivel`. Falha do lado do ÓRGÃO propaga, porque ali o erro é
 * nosso (consulta, VPN, credencial) e engoli-lo devolveria "sem dado" para um
 * posto que tem dado, que é a mentira mais cara desta tela.
 *
 * @param series    Porta das séries históricas (lado do órgão).
 * @param sibh      Gateway do SIBH (lado telemétrico).
 * @param posto     Posto alvo, com o código ANA que faz o casamento.
 * @param serie     Qual das cinco séries comparar.
 * @param janela    Período, `ate` inclusivo.
 * @param onErroSibh Observabilidade opcional quando o SIBH falha.
 */
export async function compararSerieComSibh(
  series: SeriesMedicaoRepository,
  sibh: SibhGateway,
  posto: PostoParaComparar,
  serie: SerieMedicao,
  janela: JanelaPeriodo,
  onErroSibh?: (erro: unknown) => void,
): Promise<ResultadoComparativo> {
  if (!posto.prefixoAna?.trim()) {
    return { estado: 'sem_correspondencia', motivo: 'posto_sem_codigo_ana' };
  }

  let estacoes: readonly EstacaoSibh[];
  try {
    estacoes = await sibh.listarEstacoes();
  } catch (erro) {
    onErroSibh?.(erro);
    return { estado: 'origem_indisponivel', lado: 'sibh' };
  }

  const estacao = acharEstacaoCorrespondente(posto, estacoes);
  if (!estacao) {
    return { estado: 'sem_correspondencia', motivo: 'codigo_ana_nao_esta_no_sibh' };
  }

  const identificacao: EstacaoCorrespondente = {
    prefixo: estacao.prefixo,
    nome: estacao.nome,
    tipo: estacao.tipo,
  };

  // O lado do órgão vai primeiro e sem rede pública no caminho: se ele estiver
  // vazio, a consulta ao SIBH não muda o resultado e não vale o custo.
  const doOrgao = await series.agregarPorDia(posto.prefixo, serie, janela);

  let doSibh: Map<string, number>;
  try {
    doSibh = await ladoDoSibh(sibh, serie, estacao.prefixo, janela);
  } catch (erro) {
    onErroSibh?.(erro);
    return { estado: 'origem_indisponivel', lado: 'sibh' };
  }

  const diasNoOrgao = doOrgao.filter((d) => d.valor !== null).length;
  if (diasNoOrgao === 0 || doSibh.size === 0) {
    return {
      estado: 'sem_dado_no_periodo',
      estacao: identificacao,
      diasNoOrgao,
      diasNoSibh: doSibh.size,
    };
  }

  const { pares, soNoOrgao, soNoSibh } = cruzarPorDia(serie, doOrgao, doSibh);

  // Os dois lados têm dado e nenhum dia coincide. Não é comparação: é a mesma
  // ausência de sobreposição, e por isso volta como o segundo estado, e não
  // como um terceiro estado com lista vazia dentro.
  if (pares.length === 0) {
    return {
      estado: 'sem_dado_no_periodo',
      estacao: identificacao,
      diasNoOrgao,
      diasNoSibh: doSibh.size,
    };
  }

  return {
    estado: 'dado_dos_dois_lados',
    estacao: identificacao,
    unidade: unidadeDaComparacao(serie),
    unidadeInferida: SERIES_MEDICAO[serie].unidadeInferida,
    pares,
    diasSoNoOrgao: soNoOrgao,
    diasSoNoSibh: soNoSibh,
    maiorDiferenca: pares.reduce((maior, p) => Math.max(maior, Math.abs(p.diferenca)), 0),
  };
}
