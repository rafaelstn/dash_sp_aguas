/**
 * Regra de domínio "estação ONLINE" (transmitindo) do Monitor.
 *
 * Definição portada do painel oficial (sao-paulo-rain-map, useStations.ts):
 *   - piezométrica: online se tem última transmissão (`date_last_measurement`
 *     preenchido). O status de transmissão NÃO entra nessa conta.
 *   - pluviométrica e fluviométrica: online se `transmission_status === 'ok'` E
 *     tem última transmissão.
 *
 * Função pura, sem I/O. Recebe um subconjunto mínimo da estação para ser
 * testável e reutilizável tanto sobre a entidade persistida quanto sobre dados
 * crus normalizados.
 */

import type { TipoHidrologico } from './estacao-pluviometrica';

/** Campos mínimos necessários para derivar "online". */
export interface EstacaoStatusTransmissao {
  tipoEstacao: TipoHidrologico;
  /** `transmission_status` cru do SIBH ('ok' | 'pendente' | ...) ou null. */
  transmissionStatus: string | null;
  /**
   * Momento da última transmissão. `Date` (do banco), string (ISO/cru) ou null.
   * "Presente" = não nulo e, se string, não vazia após trim.
   */
  ultimaTransmissao: string | Date | null;
}

/** `true` quando há última transmissão registrada (não nula/vazia). */
function temUltimaTransmissao(valor: string | Date | null): boolean {
  if (valor === null) return false;
  if (valor instanceof Date) return !Number.isNaN(valor.getTime());
  return valor.trim() !== '';
}

/**
 * Decide se a estação está online, aplicando a regra por tipo hidrológico.
 */
export function estacaoOnline(estacao: EstacaoStatusTransmissao): boolean {
  const temTransmissao = temUltimaTransmissao(estacao.ultimaTransmissao);

  // Piezométrica: basta ter última transmissão (status não conta).
  if (estacao.tipoEstacao === 'piezometrico') {
    return temTransmissao;
  }

  // Pluviométrica e fluviométrica: exigem status 'ok' E última transmissão.
  return estacao.transmissionStatus === 'ok' && temTransmissao;
}
