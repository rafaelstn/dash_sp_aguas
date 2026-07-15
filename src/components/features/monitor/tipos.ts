/**
 * Tipos do módulo Monitor (mapa pluviométrico, fase B2) no lado do cliente.
 *
 * Espelha o payload de GET /api/monitor/estacoes. NÃO importa nada da camada
 * de dados (server-only); o mapa é client e consome a API via fetch, então
 * declaramos o contrato aqui como dado puro serializável.
 */

export type TipoEstacao = 'manual' | 'automatico';

/** Tipo hidrologico da estacao (o que ela mede). Espelha `tipo_estacao`. */
export type TipoHidrologico = 'pluviometrico' | 'fluviometrico' | 'piezometrico';

export interface Estacao {
  id: string;
  prefixo: string | null;
  nome: string;
  lat: number;
  lng: number;
  tipo: TipoEstacao;
  /** Tipo hidrologico (pluviometrico | fluviometrico | piezometrico). */
  tipoEstacao: TipoHidrologico;
  bacia: string | null;
  /** Entidade responsável (SIBH station_owner); null = "Outros". */
  owner: string | null;
  postoId: string | null;
  sibhId: string | null;
  criadoEm: string;
  /**
   * Estação transmitindo (derivado server-side pela regra por tipo: piezo exige
   * última transmissão; pluvio/fluvio exigem status 'ok' + última transmissão).
   */
  online: boolean;
  /** Momento da última transmissão em ISO 8601, ou null. */
  ultimaTransmissao: string | null;
}

export interface RespostaEstacoes {
  total: number;
  itens: Estacao[];
}

/** Rótulo legível do tipo, reutilizado no popup, na lista e nos filtros. */
export const ROTULO_TIPO: Record<TipoEstacao, string> = {
  automatico: 'Automática',
  manual: 'Manual',
};

/**
 * Rótulo legível do tipo hidrológico, reutilizado no popup, na lista e nos
 * filtros do mapa.
 */
export const ROTULO_TIPO_HIDROLOGICO: Record<TipoHidrologico, string> = {
  pluviometrico: 'Pluviométrico',
  fluviometrico: 'Fluviométrico',
  piezometrico: 'Piezométrico',
};
