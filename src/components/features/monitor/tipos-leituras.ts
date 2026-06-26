/**
 * Tipos do painel de detalhe da estação (Monitor, fase B3).
 *
 * Espelha o payload de GET /api/monitor/estacoes/{id}/leituras. Como o resto do
 * módulo Monitor, NÃO importa da camada de dados (server-only): o painel é
 * client e consome a API via fetch, então o contrato vive aqui como dado puro
 * serializável.
 */

import type { TipoEstacao } from './tipos';

/** Cabeçalho da estação retornado junto com as leituras. */
export interface EstacaoLeituras {
  id: string;
  prefixo: string | null;
  nome: string;
  bacia: string | null;
  tipo: TipoEstacao;
  postoId: string | null;
}

/** Uma leitura diária: total de chuva do dia (mm). */
export interface LeituraDiaria {
  /** Data e hora da leitura em ISO 8601. A série é diária (1 ponto por dia). */
  momento: string;
  /** Total automático do dia, em milímetros. */
  automaticoMm: number;
  /**
   * Total manual do dia, em milímetros. Hoje vem sempre 0 (a leitura manual do
   * operador é fase futura). O painel guarda contra isso: só compara auto vs
   * manual quando houver pelo menos um manual > 0.
   */
  manualMm: number;
}

/** Resposta completa do endpoint de leituras. */
export interface RespostaLeituras {
  estacao: EstacaoLeituras;
  itens: LeituraDiaria[];
}

/** Períodos pré-definidos do seletor, em dias. */
export type PeriodoDias = 7 | 30 | 90;

export const PERIODOS: readonly { dias: PeriodoDias; rotulo: string }[] = [
  { dias: 7, rotulo: '7 dias' },
  { dias: 30, rotulo: '30 dias' },
  { dias: 90, rotulo: '90 dias' },
];

/** Estatísticas derivadas da série do período. */
export interface EstatisticasPeriodo {
  totalMm: number;
  mediaDiariaMm: number;
  diasComChuva: number;
  /** Dia mais chuvoso do período, ou null se não houver leitura. */
  diaMaisChuvoso: { momento: string; mm: number } | null;
}
