/**
 * Tipos do painel de nível da estação (Monitor, Fase 2) no lado do cliente.
 *
 * Espelha o payload de GET /api/monitor/estacoes/{id}/nivel. Como o resto do
 * módulo Monitor, NÃO importa da camada de dados (server-only): o painel é
 * client e consome a API via fetch, então o contrato vive aqui como dado puro
 * serializável.
 *
 * Diferente de `tipos-leituras.ts` (chuva, série persistida por dia
 * hidrológico), aqui a série é de NÍVEL (metros), lida ao vivo do SIBH e
 * agregada por dia de calendário — média, mínimo e máximo do dia.
 */

import type { TipoHidrologico } from './tipos';

// Reusa os períodos pré-definidos do seletor de chuva (mesma UX de janela).
export { PERIODOS } from './tipos-leituras';
export type { PeriodoDias } from './tipos-leituras';

/** Cabeçalho da estação retornado junto com a série de nível. */
export interface EstacaoNivel {
  id: string;
  prefixo: string | null;
  nome: string;
  /** Tipo hidrológico: só 'fluviometrico' ou 'piezometrico' têm nível. */
  tipoEstacao: TipoHidrologico;
  bacia: string | null;
}

/** Um ponto diário da série de nível (metros). */
export interface PontoNivel {
  /** Meia-noite (UTC) do dia de calendário, em ISO 8601. */
  momento: string;
  /** Nível médio do dia, em metros. */
  nivelMedioM: number;
  /** Menor nível do dia, em metros. */
  nivelMinM: number;
  /** Maior nível do dia, em metros. */
  nivelMaxM: number;
}

/** Resposta completa do endpoint de nível. */
export interface RespostaNivel {
  estacao: EstacaoNivel;
  itens: PontoNivel[];
}
