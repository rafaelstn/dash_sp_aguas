/**
 * Cálculos e formatação da série de leituras (Monitor B3). Funções puras, sem
 * React: facilita teste e mantém o componente do painel enxuto.
 */

import type {
  EstatisticasPeriodo,
  LeituraDiaria,
} from './tipos-leituras';

/** Arredonda para 1 casa decimal, evitando ruído de ponto flutuante. */
function umaCasa(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Formata um número em mm com 1 casa decimal no padrão pt-BR. */
export function fmtMm(n: number): string {
  return `${umaCasa(n).toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} mm`;
}

/** Formata o ISO da leitura como dd/MM (eixo e cabeçalhos curtos). */
export function fmtDataCurta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

/** Formata o ISO da leitura como dd/MM/aaaa (tabela e tooltip). */
export function fmtDataLonga(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Há pelo menos uma leitura manual registrada (> 0) no conjunto. */
export function temLeituraManual(itens: readonly LeituraDiaria[]): boolean {
  return itens.some((i) => i.manualMm > 0);
}

/** Calcula as estatísticas do período sobre a série automática. */
export function calcularEstatisticas(
  itens: readonly LeituraDiaria[],
): EstatisticasPeriodo {
  if (itens.length === 0) {
    return {
      totalMm: 0,
      mediaDiariaMm: 0,
      diasComChuva: 0,
      diaMaisChuvoso: null,
    };
  }

  let total = 0;
  let diasComChuva = 0;
  let maisChuvoso: { momento: string; mm: number } | null = null;

  for (const item of itens) {
    const mm = item.automaticoMm;
    total += mm;
    if (mm > 0) diasComChuva += 1;
    if (!maisChuvoso || mm > maisChuvoso.mm) {
      maisChuvoso = { momento: item.momento, mm };
    }
  }

  return {
    totalMm: umaCasa(total),
    mediaDiariaMm: umaCasa(total / itens.length),
    diasComChuva,
    // Se nenhum dia teve chuva, não faz sentido apontar "mais chuvoso".
    diaMaisChuvoso: maisChuvoso && maisChuvoso.mm > 0 ? maisChuvoso : null,
  };
}
