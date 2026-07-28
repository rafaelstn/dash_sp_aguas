/**
 * DTOs da CONFERENCIA fisica (inventario) no lado do navegador. Espelham os tipos
 * puros do dominio (`domain/estoque/conferencia`), mas com as datas como STRING
 * ISO (o JSON da API serializa `Date` como texto). Este e o contrato minimo para
 * a Fernanda montar a UI (Fase 1); nenhum componente aqui, so os shapes.
 */

import type {
  NaturezaConferida,
  OrigemItem,
  SituacaoItem,
  StatusConferencia,
} from '@/domain/estoque/conferencia';
import type { UnidadeFisica } from '@/domain/estoque/local';
import type { MovimentacaoDTO } from './dtos';

export type { NaturezaConferida, OrigemItem, SituacaoItem, StatusConferencia };

/** Sessao de conferencia. GET /conferencias (lista) e resposta do POST/PATCH. */
export interface ConferenciaDTO {
  id: string;
  unidade: UnidadeFisica;
  natureza: NaturezaConferida;
  localId: string | null;
  status: StatusConferencia;
  observacao: string | null;
  criadaPor: string;
  criadaEm: string;
  concluidaPor: string | null;
  concluidaEm: string | null;
  atualizadaEm: string;
}

/** 1 item conferido (snapshot ou sobra). GET /conferencias/[id]/itens. */
export interface ConferenciaItemDTO {
  id: string;
  conferenciaId: string;
  unidadeId: string | null;
  materialId: string | null;
  localEsperadoId: string | null;
  tamanho: string | null;
  origem: OrigemItem;
  situacao: SituacaoItem | null;
  localEncontradoId: string | null;
  quantidadeSistema: number | null;
  quantidadeContada: number | null;
  /** GENERATED no banco: contada - sistema (null enquanto nao contado). */
  diferenca: number | null;
  observacao: string | null;
  /** Autoria da contagem fisica (trilha, migration 0065). */
  contadoPor: string | null;
  contadoEm: string | null;
  /** Rotulo legivel resolvido pela API (nome/email), nunca o UUID cru na tela. */
  contadoPorRotulo?: string | null;
  movimentacaoId: string | null;
  reconciliadoPor: string | null;
  reconciliadoPorRotulo?: string | null;
  reconciliadoEm: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

/** Contagens agregadas para o cabecalho/resumo do detalhe. */
export interface ResumoDivergenciasDTO {
  totalItens: number;
  contados: number;
  naoContados: number;
  divergentes: number;
  reconciliados: number;
  pendentesReconciliacao: number;
  porSituacao: Record<SituacaoItem, number>;
}

/** GET /conferencias (paginado). */
export interface ListaConferenciasDTO {
  itens: ConferenciaDTO[];
  total: number;
  pagina: number;
  porPagina: number;
}

/** GET /conferencias/[id] (detalhe + resumo). */
export interface DetalheConferenciaDTO {
  conferencia: ConferenciaDTO;
  resumo: ResumoDivergenciasDTO;
}

/** GET /conferencias/[id]/itens (paginado). */
export interface ListaItensConferenciaDTO {
  itens: ConferenciaItemDTO[];
  total: number;
  pagina: number;
  porPagina: number;
}

/** Resposta de reconciliar 1 item. */
export interface ResultadoReconciliacaoDTO {
  item: ConferenciaItemDTO;
  movimentacaoId: string | null;
  /** 'base_alterada' quando o saldo atual difere do congelado (aviso ao humano). */
  aviso: 'base_alterada' | null;
  jaReconciliado: boolean;
}

/** Resposta do lote (partial success reportado por item). */
export interface ItemLoteResultadoDTO {
  itemId: string;
  sucesso: boolean;
  movimentacaoId?: string | null;
  aviso?: 'base_alterada' | null;
  jaReconciliado?: boolean;
  erro?: string;
}
export interface ResultadoLoteDTO {
  conferenciaId: string;
  total: number;
  reconciliados: number;
  falhas: number;
  itens: ItemLoteResultadoDTO[];
}

// ── Payloads de request (o que a UI envia) ──────────────────────────────────────

/** POST /conferencias. */
export interface AbrirConferenciaPayload {
  unidade: UnidadeFisica;
  natureza: NaturezaConferida;
  localId?: string;
  observacao?: string;
}

/** PATCH /conferencias/[id]/itens/[itemId] — union por natureza da sessao. */
export type ContagemPayload =
  | {
      situacao: Exclude<SituacaoItem, 'pendente'>;
      localEncontradoId?: string; // exigido se encontrado_em_outro_local
      observacao?: string;
    }
  | { quantidadeContada: number; observacao?: string };

/** POST /conferencias/[id]/itens — item sobra (union por natureza). */
export type SobraPayload =
  | { unidadeId: string; localEncontradoId: string } // serializado
  | { materialId: string; localId: string; tamanho?: string; quantidadeContada: number }; // quantificavel

/** PATCH /conferencias/[id]. */
export interface AcaoConferenciaPayload {
  acao: 'concluir' | 'cancelar';
  observacao?: string;
}

/** POST /conferencias/[id]/reconciliar (lote). */
export interface ReconciliarLotePayload {
  itemIds: string[];
}

/** Movimentacao gerada pela reconciliacao (mesmo shape do ledger). */
export type MovimentacaoAjusteDTO = MovimentacaoDTO;
