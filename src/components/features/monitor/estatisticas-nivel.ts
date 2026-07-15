/**
 * Cálculos e formatação da série de nível (Monitor, Fase 2). Funções puras, sem
 * React: facilita teste e mantém o componente do painel enxuto. Espelha o
 * desenho de `estatisticas-leituras.ts`, porém para a grandeza NÍVEL (metros).
 */

import type { PontoNivel } from './tipos-nivel';

/** Tipos hidrológicos que possuem série de nível (pluviométrico não entra). */
export type TipoNivel = 'fluviometrico' | 'piezometrico';

/**
 * Rótulos da grandeza por tipo de estação. Fluviométrica mede o nível/cota do
 * rio; piezométrica mede o nível da água subterrânea. Usado em títulos, no
 * aviso e nas descrições acessíveis.
 */
export const ROTULO_GRANDEZA_NIVEL: Record<
  TipoNivel,
  { titulo: string; artigoFrase: string }
> = {
  fluviometrico: {
    titulo: 'Nível do rio',
    artigoFrase: 'do nível (cota) do rio',
  },
  piezometrico: {
    titulo: 'Nível de água subterrânea',
    artigoFrase: 'do nível de água subterrânea',
  },
};

/** Arredonda para 2 casas decimais, evitando ruído de ponto flutuante. */
function duasCasas(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Formata um número em metros com 2 casas decimais no padrão pt-BR. */
export function fmtMetros(n: number): string {
  return `${duasCasas(n).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} m`;
}

/** Estatísticas derivadas da série de nível do período. */
export interface EstatisticasNivel {
  /** Média dos níveis médios diários, em metros. */
  medioM: number;
  /** Menor nível mínimo diário observado no período, em metros. */
  minimoM: number;
  /** Maior nível máximo diário observado no período, em metros. */
  maximoM: number;
  /** Leitura mais recente do período (momento + nível médio), ou null. */
  ultima: { momento: string; nivelMedioM: number } | null;
}

/**
 * Calcula as estatísticas de nível do período. Média sobre os níveis médios
 * diários; mínimo e máximo absolutos vindos das colunas de mínimo/máximo de cada
 * dia. A série chega crescente no tempo, então a última leitura é o último item.
 */
export function calcularEstatisticasNivel(
  itens: readonly PontoNivel[],
): EstatisticasNivel {
  if (itens.length === 0) {
    return { medioM: 0, minimoM: 0, maximoM: 0, ultima: null };
  }

  let somaMedios = 0;
  let minimo = Number.POSITIVE_INFINITY;
  let maximo = Number.NEGATIVE_INFINITY;

  for (const item of itens) {
    somaMedios += item.nivelMedioM;
    if (item.nivelMinM < minimo) minimo = item.nivelMinM;
    if (item.nivelMaxM > maximo) maximo = item.nivelMaxM;
  }

  const ultimo = itens[itens.length - 1];

  return {
    medioM: duasCasas(somaMedios / itens.length),
    minimoM: duasCasas(minimo),
    maximoM: duasCasas(maximo),
    ultima: ultimo
      ? { momento: ultimo.momento, nivelMedioM: duasCasas(ultimo.nivelMedioM) }
      : null,
  };
}
