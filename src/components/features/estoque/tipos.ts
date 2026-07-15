/**
 * Contrato minimo do modulo Estoque para o frontend (a Fernanda detalha a UI).
 *
 * Reexporta os tipos PUROS do dominio (sem `server-only`, seguros no client) e
 * define as formas de payload/resposta das rotas REST em `src/app/api/estoque/*`.
 * Nao ha logica aqui: so tipos, para os componentes tiparem fetch/estado.
 */

export type { Natureza, Material, FiltrosMaterial, UpsertMaterial } from '@/domain/estoque/material';
export type { Unidade, FiltrosUnidade, UpsertUnidade } from '@/domain/estoque/unidade';
export type {
  Local,
  UnidadeFisica,
  EntradaLocal,
} from '@/domain/estoque/local';
export type { Categoria, UpsertCategoria } from '@/domain/estoque/categoria';
export type { Saldo, SaldoComContexto, FiltrosSaldo } from '@/domain/estoque/saldo';
export type {
  Movimentacao,
  TipoMovimentacao,
  ResultadoMovimentacao,
  FiltrosMovimentacao,
} from '@/domain/estoque/movimentacao';
export type { Estado } from '@/domain/estoque/estado';
export type { Status } from '@/domain/estoque/status-unidade';

/** Resposta paginada padrao das listagens (materiais, unidades, movimentacoes). */
export interface RespostaPaginada<T> {
  itens: T[];
  total: number;
  pagina: number;
  porPagina: number;
}

/**
 * Payload aceito por `POST /api/estoque/movimentacoes`. Alvo XOR: informe
 * `unidadeId` (serializado) OU `materialId` (quantificavel), nunca os dois.
 */
export interface PayloadMovimentacao {
  tipo: import('@/domain/estoque/movimentacao').TipoMovimentacao;
  unidadeId?: string;
  materialId?: string;
  quantidade?: number;
  /** Bucket de tamanho do quantificavel (ex. bitola de cabo). */
  tamanho?: string;
  localOrigem?: string;
  localDestino?: string;
  /** Obrigatorio para baixa e ajuste. */
  motivo?: string;
  /** Ajuste de serializado. */
  estado?: import('@/domain/estoque/estado').Estado;
  /** Ajuste de serializado. */
  status?: import('@/domain/estoque/status-unidade').Status;
}
