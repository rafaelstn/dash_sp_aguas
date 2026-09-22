import type { Paginacao } from '@/application/ports/series-medicao-repository';

/**
 * Medições de vazão em campo e curvas-chave de um posto, lidas do `Dbfch`.
 *
 * Tudo aqui é EXIBIÇÃO do que o órgão gravou. Nenhum valor é recalculado:
 * a curva-chave sai com os coeficientes como estão, e quem converte cota em
 * vazão continua sendo o órgão.
 *
 * Valores numéricos saem como o banco guarda. Unidades que o órgão não
 * confirmou por escrito não viram sufixo de campo; o que se sabe está na
 * documentação de cada campo.
 */

/**
 * Uma medição de vazão em campo (`ResumoMedicaoVazoes`).
 *
 * MINIMIZAÇÃO (LGPD): a tabela não tem coluna de pessoa (MEDIDO em 17/09/2026),
 * e a entidade medidora é órgão ou empresa, não pessoa física. Códigos internos
 * do mainframe (sequência, número de hélice, tempo de molinete, índices de
 * margem e pendência) ficam de fora por não terem significado para a tela.
 */
export interface MedicaoVazao {
  /** Início e fim da medição, em ISO 8601 UTC. */
  readonly dataInicial: string;
  readonly dataFinal: string;
  /** Cota da régua no início e no fim, `decimal(5,2)`. */
  readonly cotaInicial: number;
  readonly cotaFinal: number;
  /** Vazão líquida medida, `decimal(9,3)`, em m³/s. */
  readonly vazaoLiquida: number;
  readonly areaSeccao: number | null;
  readonly larguraSeccao: number | null;
  readonly profundidadeMedia: number | null;
  readonly velocidadeMedia: number | null;
  /** Código de qualidade de uma letra, como o órgão gravou. */
  readonly qualidade: string | null;
  /** Sigla da entidade que mediu (órgão ou empresa). */
  readonly entidadeMedidora: string | null;
}

export interface PaginaMedicoesVazao {
  readonly total: number;
  readonly itens: readonly MedicaoVazao[];
}

/**
 * Coeficientes de um trecho da curva, como gravados (`decimal(5,2)` cada).
 *
 * A forma da equação e o significado de `I` (limite do trecho, pelo que a
 * ordenação sugere) NÃO foram confirmados pelo órgão, e por isso não estão
 * escritos aqui como fato nem são usados em cálculo nenhum.
 */
export interface TrechoCurvaChave {
  readonly k: number;
  readonly h: number;
  readonly n: number;
  readonly i: number;
}

/**
 * Uma curva-chave e o período em que vale (`CurvaChaveFluviometricas` mais
 * `EquacoesCurvaChaveFluviometricas`).
 *
 * `trechos` pode vir VAZIO: 135 das 2.737 curvas não têm equação gravada
 * (MEDIDO em 17/09/2026). A tela mostra a curva e diz que não há equação, em
 * vez de a curva sumir.
 */
export interface CurvaChave {
  /** Início e fim da vigência, em ISO 8601 UTC. */
  readonly dataInicio: string;
  readonly dataFinal: string;
  /** `true` quando hoje está dentro da vigência. Nenhuma curva está, em 17/09/2026. */
  readonly vigente: boolean;
  /** Código de qualidade de três letras (`REG` em 2.729 curvas). */
  readonly indiceQualidade: string;
  /** `C` consistida, `I` não consistida, como o órgão gravou. */
  readonly consistencia: string;
  /** Ordenados pela cota limite `i`, crescente. */
  readonly trechos: readonly TrechoCurvaChave[];
}

export interface VazaoPostoRepository {
  /**
   * Medições do posto, da mais recente para a mais antiga.
   * `null` quando o prefixo não existe (a rota responde 404).
   */
  listarMedicoes(prefixo: string, paginacao: Paginacao): Promise<PaginaMedicoesVazao | null>;

  /**
   * Todas as curvas do posto, da vigência mais recente para a mais antiga.
   * Sem paginação: o maior caso da base tem 60 curvas.
   * `null` quando o prefixo não existe.
   */
  listarCurvasChave(prefixo: string): Promise<readonly CurvaChave[] | null>;
}
