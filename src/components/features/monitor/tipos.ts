/**
 * Tipos do módulo Monitor (mapa pluviométrico, fase B2) no lado do cliente.
 *
 * Espelha o payload de GET /api/monitor/estacoes. NÃO importa nada da camada
 * de dados (server-only); o mapa é client e consome a API via fetch, então
 * declaramos o contrato aqui como dado puro serializável.
 */

export type TipoEstacao = 'manual' | 'automatico';

export interface Estacao {
  id: string;
  prefixo: string | null;
  nome: string;
  lat: number;
  lng: number;
  tipo: TipoEstacao;
  bacia: string | null;
  postoId: string | null;
  sibhId: string | null;
  criadoEm: string;
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
