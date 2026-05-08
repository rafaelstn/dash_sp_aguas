import type { EstadoTriagem } from './triagem';

/**
 * Eventos do audit trail. Espelha o CHECK constraint da migration 0025.
 */
export type TipoEventoTriagem =
  | 'submetida'
  | 'reenvio_apos_devolucao'
  | 'revisao_iniciada'
  | 'revisao_liberada'
  | 'lock_expirado'
  | 'aprovada'
  | 'rejeitada'
  | 'devolvida';

export const TIPOS_EVENTO_TRIAGEM: readonly TipoEventoTriagem[] = Object.freeze([
  'submetida',
  'reenvio_apos_devolucao',
  'revisao_iniciada',
  'revisao_liberada',
  'lock_expirado',
  'aprovada',
  'rejeitada',
  'devolvida',
]);

/**
 * Linha em `triagem_eventos`. Append-only — UPDATE/DELETE bloqueados via REVOKE.
 */
export interface EventoTriagem {
  id: string;
  triagemId: string;
  evento: TipoEventoTriagem;
  estadoAnterior: EstadoTriagem | null;
  estadoNovo: EstadoTriagem | null;
  atorId: string | null;
  motivo: string | null;
  payload: Record<string, unknown> | null;
  ip: string | null;
  userAgent: string | null;
  ocorreuEm: Date;
}

/**
 * Entrada para gravar evento. ID/ocorreu_em vêm do banco.
 */
export interface EntradaEventoTriagem {
  triagemId: string;
  evento: TipoEventoTriagem;
  estadoAnterior: EstadoTriagem | null;
  estadoNovo: EstadoTriagem | null;
  atorId: string | null;
  motivo?: string | null;
  payload?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
}
