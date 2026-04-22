/**
 * Entidade RevisaoDesconformidade — registro operacional de curadoria.
 * Gravada com `usuarioId = null` e `ip` preenchido no MVP (ADR-0003).
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
  revisadoEm: Date | null;
  createdAt: Date;
}

export interface ParametrosNovaRevisao {
  tipoEntidade: TipoEntidadeRevisada;
  idEntidade: string;
  categoria: CategoriaDesconformidade;
  nota: string | null;
  ip: string | null;
}
