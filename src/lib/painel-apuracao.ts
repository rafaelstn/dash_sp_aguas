/**
 * Apuração de indicador do painel: a diferença entre "medimos e deu zero" e
 * "não temos como medir isto aqui".
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUE ESTE MÓDULO EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * Desde que o cadastro de posto passou a vir do `Dbfch` (ADR-0023), dois
 * indicadores do painel deixaram de ter resposta nesta instalação, e os dois
 * chegavam à tela como ZERO:
 *
 *   - "Postos sem arquivo" saía `5.790 · 100,0% da rede não indexada`, em
 *     vermelho. O número é aritmeticamente correto e não diz nada sobre posto
 *     nenhum: ele diz que o indexador nunca rodou. Cartão vermelho que ninguém
 *     consegue resolver é o que ensina o gestor a ignorar o painel inteiro.
 *   - "Cadastro irregular" saía `0`, junto de dois quadros vazios, porque a
 *     régua de desconformidade não descreve o vocabulário do `Dbfch` e o
 *     adaptador devolve vazio de propósito (ver o bloco `DESCONFORMIDADE` em
 *     `painel-cadastro-repository.mssql.ts`).
 *
 * Zero e "não apurado" ocupam o mesmo espaço na tela e significam o oposto: o
 * primeiro é um fato sobre a rede, o segundo é um fato sobre a nossa medição.
 * Este módulo é puro de propósito — sem React, sem driver, sem `server-only` —
 * para que a decisão seja exercitável por teste de unidade, que é onde este
 * tipo de erro aparece.
 */

/* ──────────────────────────────────────────────────────────────────────────
 * O VALOR DE UM CARTÃO
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Um indicador que a origem não tem como apurar.
 *
 * Só se constrói pela função `naoApurado`, e ela EXIGE o motivo. É guarda de
 * tipo, e não cortesia: um cartão com traço mudo, sem dizer por quê, devolve a
 * mesma dúvida que o zero vermelho causava.
 */
export interface KPINaoApurado {
  readonly naoApurado: true;
  readonly motivo: string;
}

/** O que um cartão de KPI aceita como valor. */
export type ValorKPI = number | string | KPINaoApurado;

export function naoApurado(motivo: string): KPINaoApurado {
  return { naoApurado: true, motivo };
}

export function ehNaoApurado(valor: ValorKPI): valor is KPINaoApurado {
  return typeof valor === 'object' && valor.naoApurado === true;
}

/**
 * Veredito sobre um indicador. Quando apurado, carrega o próprio número: sem
 * isso o chamador precisaria ler o valor de outro lugar, e a única forma de
 * errar seria justamente desenhar o número de um estado no outro.
 */
export type Apuracao<T> =
  | { readonly apurado: true; readonly valor: T }
  | { readonly apurado: false; readonly motivo: string };

/* ──────────────────────────────────────────────────────────────────────────
 * OS MOTIVOS
 *
 * Ficam nomeados aqui, e não escritos no lugar da chamada, por dois motivos:
 * são texto de PRODUTO (o gestor lê literalmente esta frase), e o mesmo motivo
 * aparece no cartão e no bloco da seção — valor escrito duas vezes é uma
 * divergência agendada.
 * ────────────────────────────────────────────────────────────────────────── */

export const MOTIVO_INDEXACAO_NUNCA_EXECUTOU =
  'Nenhuma indexação de arquivos executada nesta base.';
export const MOTIVO_INDEXACAO_INDISPONIVEL =
  'Histórico de indexação indisponível no momento.';
export const MOTIVO_CONFORMIDADE_SEM_CRITERIO =
  'Critério de conformidade em definição com o órgão.';
export const MOTIVO_CONFORMIDADE_SEM_CLASSIFICACAO =
  'Sem classificação de conformidade nesta base.';

/* ──────────────────────────────────────────────────────────────────────────
 * VEREDITO 1 — "POSTOS SEM ARQUIVO"
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * O que se sabe sobre a indexação de arquivos. Vem inteiro de
 * `PainelRepository.atividadeRecente()`, que já existia: nenhuma mudança de
 * contrato foi necessária para este veredito.
 */
export interface SinalDeIndexacao {
  /** Lotes distintos registrados em `indexacao_log`. */
  readonly totalLotesIndexacao: number;
  /** Linhas em `arquivos_indexados`. */
  readonly arquivosIndexadosTotal: number;
}

/**
 * "Postos sem arquivo" só é um fato sobre a rede depois que a indexação rodou
 * ao menos uma vez. Antes disso ele é `total - 0 = total`, ou seja, uma cópia
 * do total de postos pintada de vermelho.
 *
 * Duas evidências, e não uma: o registro do lote é a primária, mas um
 * `indexacao_log` expurgado com arquivos ainda indexados NÃO pode ser lido
 * como "nunca indexou". Guarda que olha uma origem só tem porta dos fundos.
 *
 * @param sinal `null` quando a consulta ao histórico falhou — desconhecido
 *   também é não apurado, e com motivo próprio, porque manda procurar em outro
 *   lugar (infraestrutura, e não escopo).
 */
export function apuracaoDePostosSemArquivo(
  sinal: SinalDeIndexacao | null,
  postosSemArquivo: number,
): Apuracao<number> {
  if (sinal === null) {
    return { apurado: false, motivo: MOTIVO_INDEXACAO_INDISPONIVEL };
  }
  if (sinal.totalLotesIndexacao > 0 || sinal.arquivosIndexadosTotal > 0) {
    return { apurado: true, valor: postosSemArquivo };
  }
  return { apurado: false, motivo: MOTIVO_INDEXACAO_NUNCA_EXECUTOU };
}

/* ──────────────────────────────────────────────────────────────────────────
 * VEREDITO 2 — "CADASTRO IRREGULAR" E OS DOIS QUADROS QUE DEPENDEM DELE
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Governa três superfícies de uma vez, porque as três saem da MESMA régua: o
 * cartão "Cadastro irregular", o ranking de UGRHI por taxa de irregularidade e
 * o quadro de tipos de inconsistência. Esconder uma e deixar as outras seria
 * a mesma tela discordando de si mesma.
 *
 * @param desconformidadesPostos `null` quando a ORIGEM declara que não
 *   classifica conformidade. É a resposta definitiva, e é a que se quer.
 * @param classesDeDesconformidade as classes apuradas; só a contagem importa.
 */
export function apuracaoDeConformidade(
  desconformidadesPostos: number | null,
  classesDeDesconformidade: readonly unknown[],
): Apuracao<number> {
  if (desconformidadesPostos === null) {
    return { apurado: false, motivo: MOTIVO_CONFORMIDADE_SEM_CRITERIO };
  }

  /*
   * DÍVIDA DECLARADA, E ELA CAI QUANDO O CONTRATO CARREGAR O `null`.
   *
   * Isto está errado e ainda não foi corrigido: hoje o adaptador do `Dbfch`
   * devolve `0` (e não `null`) para um indicador que ele não sabe apurar, e o
   * contrato `ResumoPendencias.desconformidadesPostos` é `number`. Sem uma
   * declaração da origem, "0 desconformes com nenhuma classe" tem duas
   * leituras: origem sem régua, ou régua que não achou nada.
   *
   * Enquanto isso, o conservador é tratar como NÃO APURADO, e por isso o
   * motivo é redigido para ser verdadeiro nas duas leituras (fala de
   * classificação AUSENTE, não de critério inexistente). O custo é subestimar
   * uma base limpa; o custo do contrário seria afirmar "nenhuma inconsistência
   * detectada" sem ter detectado coisa alguma.
   *
   * QUANDO `desconformidadesPostos` PASSAR A SER `number | null`: apagar este
   * bloco inteiro e devolver `{ apurado: true, valor: 0 }` aqui, porque aí zero
   * volta a ser zero medido.
   */
  if (desconformidadesPostos === 0 && classesDeDesconformidade.length === 0) {
    return { apurado: false, motivo: MOTIVO_CONFORMIDADE_SEM_CLASSIFICACAO };
  }

  return { apurado: true, valor: desconformidadesPostos };
}
