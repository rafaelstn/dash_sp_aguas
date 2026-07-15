/**
 * Cliente da API de CONFERENCIA fisica (inventario) no lado do navegador.
 * Espelha o padrao de `api.ts` do modulo de Estoque: cada funcao resolve com os
 * dados no sucesso ou lanca `ErroEstoque` (mensagem PT-BR pronta). A autorizacao
 * real (leitura=usuario, escrita=admin) vive no backend; aqui so consumimos.
 */

import { lancarErro } from './erros';
import type {
  AbrirConferenciaPayload,
  AcaoConferenciaPayload,
  ConferenciaDTO,
  ConferenciaItemDTO,
  ContagemPayload,
  DetalheConferenciaDTO,
  ListaConferenciasDTO,
  ListaItensConferenciaDTO,
  ReconciliarLotePayload,
  ResultadoLoteDTO,
  ResultadoReconciliacaoDTO,
  SobraPayload,
} from './conferencia-dtos';
import type { NaturezaConferida, StatusConferencia } from '@/domain/estoque/conferencia';
import type { SituacaoItem } from '@/domain/estoque/conferencia';
import type { UnidadeFisica } from './dtos';

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;
const ACCEPT = { Accept: 'application/json' } as const;

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const resp = await fetch(url, { method: 'GET', headers: ACCEPT, signal });
  if (!resp.ok) await lancarErro(resp);
  return (await resp.json()) as T;
}

async function enviar<T>(
  url: string,
  metodo: 'POST' | 'PATCH',
  corpo?: unknown,
): Promise<T> {
  const resp = await fetch(url, {
    method: metodo,
    headers: corpo === undefined ? ACCEPT : { ...JSON_HEADERS, ...ACCEPT },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  if (!resp.ok) await lancarErro(resp);
  return (await resp.json()) as T;
}

/** Monta querystring ignorando valores vazios/undefined. */
function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '' || v === false) continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

// ── Filtros de leitura ───────────────────────────────────────────────────────
export interface FiltrosConferenciasUI {
  unidade?: UnidadeFisica;
  natureza?: NaturezaConferida;
  status?: StatusConferencia;
  pagina?: number;
  porPagina?: number;
}

export interface FiltrosItensUI {
  situacao?: SituacaoItem;
  apenasDivergentes?: boolean;
  apenasPendentesRecon?: boolean;
  pagina?: number;
  porPagina?: number;
}

// ── Sessoes ──────────────────────────────────────────────────────────────────
export function listarConferencias(
  f: FiltrosConferenciasUI,
  signal?: AbortSignal,
): Promise<ListaConferenciasDTO> {
  return getJson(
    `/api/estoque/conferencias${qs({
      unidade: f.unidade,
      natureza: f.natureza,
      status: f.status,
      pagina: f.pagina,
      porPagina: f.porPagina,
    })}`,
    signal,
  );
}

export function abrirConferencia(payload: AbrirConferenciaPayload): Promise<ConferenciaDTO> {
  return enviar('/api/estoque/conferencias', 'POST', payload);
}

export function obterConferencia(
  id: string,
  signal?: AbortSignal,
): Promise<DetalheConferenciaDTO> {
  return getJson(`/api/estoque/conferencias/${id}`, signal);
}

export function acaoConferencia(
  id: string,
  payload: AcaoConferenciaPayload,
): Promise<ConferenciaDTO> {
  return enviar(`/api/estoque/conferencias/${id}`, 'PATCH', payload);
}

// ── Itens ────────────────────────────────────────────────────────────────────
export function listarItensConferencia(
  id: string,
  f: FiltrosItensUI,
  signal?: AbortSignal,
): Promise<ListaItensConferenciaDTO> {
  return getJson(
    `/api/estoque/conferencias/${id}/itens${qs({
      situacao: f.situacao,
      apenasDivergentes: f.apenasDivergentes,
      apenasPendentesRecon: f.apenasPendentesRecon,
      pagina: f.pagina,
      porPagina: f.porPagina,
    })}`,
    signal,
  );
}

export function registrarContagem(
  id: string,
  itemId: string,
  payload: ContagemPayload,
): Promise<ConferenciaItemDTO> {
  return enviar(`/api/estoque/conferencias/${id}/itens/${itemId}`, 'PATCH', payload);
}

export function adicionarSobra(id: string, payload: SobraPayload): Promise<ConferenciaItemDTO> {
  return enviar(`/api/estoque/conferencias/${id}/itens`, 'POST', payload);
}

// ── Reconciliacao ────────────────────────────────────────────────────────────
export function reconciliarItem(
  id: string,
  itemId: string,
): Promise<ResultadoReconciliacaoDTO> {
  return enviar(`/api/estoque/conferencias/${id}/itens/${itemId}/reconciliar`, 'POST');
}

export function reconciliarLote(
  id: string,
  payload: ReconciliarLotePayload,
): Promise<ResultadoLoteDTO> {
  return enviar(`/api/estoque/conferencias/${id}/reconciliar`, 'POST', payload);
}
