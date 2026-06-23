/**
 * Helpers de variação (delta) para KPIs do painel. Puros e testáveis,
 * sem dependência de React, para o cálculo de seta/percentual e a geração
 * do path do sparkline ficarem cobertos por teste unitário.
 */

export type DirecaoDelta = 'subiu' | 'caiu' | 'estavel';

export interface Delta {
  direcao: DirecaoDelta;
  /** Variação percentual com sinal (ex: +12.5, -3.0). `null` se base for 0. */
  percentual: number | null;
  /** Diferença absoluta (atual menos anterior). */
  absoluto: number;
}

/**
 * Calcula a variação entre o valor atual e o do período anterior.
 * Quando o anterior é 0, o percentual fica `null` (divisão indefinida),
 * mas a direção e o absoluto continuam válidos.
 */
export function calcularDelta(atual: number, anterior: number): Delta {
  const absoluto = atual - anterior;
  const direcao: DirecaoDelta =
    absoluto > 0 ? 'subiu' : absoluto < 0 ? 'caiu' : 'estavel';
  const percentual =
    anterior === 0 ? null : (absoluto / Math.abs(anterior)) * 100;
  return { direcao, percentual, absoluto };
}

/**
 * Rótulo textual acessível da variação. Nunca depende só de cor (WCAG 1.4.1):
 * descreve a direção em palavras e formata o percentual em pt-BR.
 */
export function rotuloDelta(delta: Delta): string {
  const palavra =
    delta.direcao === 'subiu'
      ? 'aumento'
      : delta.direcao === 'caiu'
        ? 'redução'
        : 'sem variação';
  if (delta.direcao === 'estavel') return 'Sem variação';
  if (delta.percentual === null) {
    const sinal = delta.absoluto > 0 ? '+' : '';
    return `${palavra} de ${sinal}${delta.absoluto.toLocaleString('pt-BR')} (sem base anterior)`;
  }
  const abs = Math.abs(delta.percentual);
  const formatado = abs.toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return `${palavra} de ${formatado}%`;
}

/**
 * Gera o atributo `d` de um <path> SVG para um sparkline a partir de uma
 * série numérica, normalizada num viewBox `largura` x `altura`. Retorna
 * string vazia quando a série tem menos de 2 pontos (nada a desenhar).
 */
export function sparklinePath(
  serie: readonly number[],
  largura: number,
  altura: number,
): string {
  if (serie.length < 2) return '';
  const min = Math.min(...serie);
  const max = Math.max(...serie);
  const amplitude = max - min || 1;
  const passo = largura / (serie.length - 1);
  return serie
    .map((valor, i) => {
      const x = i * passo;
      // y invertido: maior valor mais perto do topo (y menor).
      const y = altura - ((valor - min) / amplitude) * altura;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}
