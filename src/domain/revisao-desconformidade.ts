/**
 * Entidade RevisaoDesconformidade — registro operacional de curadoria.
 * Com auth Supabase ativa (ADR-0004), `usuarioId` passa a ser preenchido.
 * `ip` permanece como dado complementar pra auditoria forense.
 */

import type { CategoriaDesconformidade } from './desconformidade';

export type TipoEntidadeRevisada = 'posto' | 'arquivo';
export type StatusRevisao = 'pendente' | 'revisado';

export interface RevisaoDesconformidade {
  id: string;
  tipoEntidade: TipoEntidadeRevisada;
  idEntidade: string;
  categoria: CategoriaDesconformidade;
  status: StatusRevisao;
  nota: string | null;
  ip: string | null;
  usuarioId: string | null;
  revisadoEm: Date | null;
  createdAt: Date;
}

export interface ParametrosNovaRevisao {
  tipoEntidade: TipoEntidadeRevisada;
  idEntidade: string;
  categoria: CategoriaDesconformidade;
  nota: string | null;
  ip: string | null;
  usuarioId: string | null;
}
