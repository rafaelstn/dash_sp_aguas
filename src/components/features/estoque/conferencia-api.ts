/**
 * Cliente da API de CONFERENCIA fisica (inventario) no lado do navegador.
 * Espelha o padrao de `api.ts` do modulo de Estoque: cada funcao resolve com os
 * dados no sucesso ou lanca `ErroEstoque` (mensagem PT-BR pronta). A autorizacao
 * real (leitura=usuario, escrita=admin) vive no backend; aqui so consumimos.
 */

import { ErroEstoque, lancarErro } from './erros';
import { agregarLotes, dividirEmOndas } from './conferencia-ui';
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

/** Teto de paginas de uma carga completa e tamanho de cada pagina do servidor. */
const POR_PAGINA_SERVIDOR = 200;
const TETO_PAGINAS = 12;

export interface CargaItens {
  itens: ConferenciaItemDTO[];
  /** Total do escopo segundo o servidor (pode ser maior que `itens.length`). */
  total: number;
  /** true quando o teto de paginas cortou o resultado: a tela NAO tem tudo. */
  parcial: boolean;
}

/**
 * Carrega todos os itens de um escopo, pagina a pagina, ate o teto de seguranca.
 * Devolve `parcial: true` quando o teto cortou, para a tela poder AVISAR: uma
 * conferencia maior que o teto era truncada em silencio, e uma contagem que
 * parece completa sem estar e exatamente o que um inventario nao pode produzir.
 */
export async function carregarItensCompleto(
  id: string,
  filtros: FiltrosItensUI,
  signal?: AbortSignal,
): Promise<CargaItens> {
  const acc: ConferenciaItemDTO[] = [];
  let total = 0;
  for (let pagina = 1; pagina <= TETO_PAGINAS; pagina += 1) {
    const r = await listarItensConferencia(
      id,
      { ...filtros, pagina, porPagina: POR_PAGINA_SERVIDOR },
      signal,
    );
    total = r.total;
    acc.push(...r.itens);
    if (acc.length >= r.total || r.itens.length === 0) break;
  }
  return { itens: acc, total, parcial: acc.length < total };
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

/** Remove um item de SOBRA adicionado por engano (204 sem corpo). */
export async function removerSobra(id: string, itemId: string): Promise<void> {
  const resp = await fetch(`/api/estoque/conferencias/${id}/itens/${itemId}`, {
    method: 'DELETE',
    headers: ACCEPT,
  });
  if (!resp.ok) await lancarErro(resp);
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

/** Progresso de um lote dividido em ondas, para a barra da tela. */
export interface ProgressoLote {
  enviados: number;
  total: number;
}

export interface ResultadoOndas {
  /** Agregado das ondas que CHEGARAM a ser processadas pelo servidor. */
  resultado: ResultadoLoteDTO;
  /** Mensagem do erro que interrompeu; null quando todas as ondas passaram. */
  interrompido: string | null;
}

/**
 * Reconcilia um conjunto de qualquer tamanho dividindo-o em ondas do teto do
 * servidor, uma requisicao de cada vez (nunca em paralelo: cada item mexe no
 * ledger, e disparar ondas concorrentes so aumenta contencao de lock e consumo
 * de rate limit).
 *
 * Se uma onda falhar, PARA e devolve o agregado do que ja foi aplicado junto do
 * motivo. O que passou esta aplicado de verdade (cada item e uma transacao
 * atomica no servidor), entao esconder o parcial atras de um "erro" seco faria
 * o operador reprocessar as cegas.
 */
export async function reconciliarEmOndas(
  id: string,
  itemIds: readonly string[],
  aoProgredir?: (p: ProgressoLote) => void,
): Promise<ResultadoOndas> {
  const partes: ResultadoLoteDTO[] = [];
  let enviados = 0;
  for (const onda of dividirEmOndas(itemIds)) {
    try {
      partes.push(await reconciliarLote(id, { itemIds: onda }));
    } catch (e) {
      return {
        resultado: agregarLotes(id, partes),
        interrompido:
          e instanceof ErroEstoque ? e.message : 'Não foi possível reconciliar o lote.',
      };
    }
    enviados += onda.length;
    aoProgredir?.({ enviados, total: itemIds.length });
  }
  return { resultado: agregarLotes(id, partes), interrompido: null };
}
