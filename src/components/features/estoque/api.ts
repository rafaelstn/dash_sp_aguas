/**
 * Cliente da API de estoque (lado do navegador). Cada funcao resolve com os
 * dados no sucesso ou lanca `ErroEstoque` (mensagem PT-BR pronta). A
 * autorizacao real vive no backend; aqui so consumimos e traduzimos.
 */

import { lancarErro } from './erros';
import type { PayloadMovimentacao } from './tipos';
import type { UpsertMaterial } from '@/domain/estoque/material';
import type { UpsertUnidade } from '@/domain/estoque/unidade';
import type { ItemEtiqueta } from '@/domain/estoque/etiqueta';
import type {
  CategoriaDTO,
  DetalheUnidadeDTO,
  LocalDTO,
  MaterialDTO,
  MovimentacaoTrilhaDTO,
  RespostaLista,
  RespostaPaginada,
  ResultadoMovimentacaoDTO,
  SaldoContextoDTO,
  UnidadeDTO,
  Estado,
  Natureza,
  Status,
  UnidadeFisica,
  TipoMovimentacao,
} from './dtos';

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;
const ACCEPT = { Accept: 'application/json' } as const;

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const resp = await fetch(url, { method: 'GET', headers: ACCEPT, signal });
  if (!resp.ok) await lancarErro(resp);
  return (await resp.json()) as T;
}

async function enviar<T>(
  url: string,
  metodo: 'POST' | 'PATCH' | 'DELETE',
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
function qs(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

// ── Filtros de leitura ───────────────────────────────────────────────────────
export interface FiltrosUnidadesUI {
  unidade?: UnidadeFisica;
  local?: string;
  estado?: Estado;
  status?: Status;
  materialId?: string;
  busca?: string;
  pagina?: number;
  porPagina?: number;
}

export interface FiltrosSaldosUI {
  materialId?: string;
  local?: string;
  unidade?: UnidadeFisica;
}

export interface FiltrosMovimentacoesUI {
  tipo?: TipoMovimentacao;
  unidadeId?: string;
  materialId?: string;
  local?: string;
  pagina?: number;
  porPagina?: number;
}

// ── Unidades serializadas ────────────────────────────────────────────────────
export function listarUnidades(
  f: FiltrosUnidadesUI,
  signal?: AbortSignal,
): Promise<RespostaPaginada<UnidadeDTO>> {
  return getJson(
    `/api/estoque/unidades${qs({
      unidade: f.unidade,
      local: f.local,
      estado: f.estado,
      status: f.status,
      materialId: f.materialId,
      busca: f.busca,
      pagina: f.pagina,
      porPagina: f.porPagina,
    })}`,
    signal,
  );
}

/** Conta unidades de um filtro sem trazer as linhas (porPagina=1 -> total). */
export async function contarUnidades(
  f: FiltrosUnidadesUI,
  signal?: AbortSignal,
): Promise<number> {
  const r = await listarUnidades({ ...f, pagina: 1, porPagina: 1 }, signal);
  return r.total;
}

export function obterUnidade(id: string, signal?: AbortSignal): Promise<DetalheUnidadeDTO> {
  return getJson(`/api/estoque/unidades/${id}`, signal);
}

export function criarUnidade(dados: UpsertUnidade): Promise<UnidadeDTO> {
  return enviar('/api/estoque/unidades', 'POST', dados);
}

export function atualizarUnidade(
  id: string,
  dados: Partial<UpsertUnidade>,
): Promise<UnidadeDTO> {
  return enviar(`/api/estoque/unidades/${id}`, 'PATCH', dados);
}

export function excluirUnidade(id: string): Promise<{ id: string; removido: boolean }> {
  return enviar(`/api/estoque/unidades/${id}`, 'DELETE');
}

// ── Etiquetas / QR de patrimonio ─────────────────────────────────────────────
/** Filtros da geracao de etiquetas: os MESMOS da aba serializada. */
export interface FiltrosEtiquetasUI {
  unidade?: UnidadeFisica;
  local?: string;
  estado?: Estado;
  status?: Status;
  materialId?: string;
  busca?: string;
}

/** Resposta enxuta da geracao de etiquetas (uma por unidade do filtro atual). */
export interface RespostaEtiquetas {
  itens: ItemEtiqueta[];
  total: number;
  /** true quando o conjunto passou do teto e foi cortado (refinar o filtro). */
  truncado: boolean;
}

/**
 * Busca o conjunto de serializados do filtro atual (sem paginacao) para a visao
 * de impressao de etiquetas. Reaproveita `GET /api/estoque/unidades/etiquetas`.
 */
export function listarEtiquetas(
  f: FiltrosEtiquetasUI,
  signal?: AbortSignal,
): Promise<RespostaEtiquetas> {
  return getJson(
    `/api/estoque/unidades/etiquetas${qs({
      unidade: f.unidade,
      local: f.local,
      estado: f.estado,
      status: f.status,
      materialId: f.materialId,
      busca: f.busca,
    })}`,
    signal,
  );
}

// ── Saldos (quantificaveis) ──────────────────────────────────────────────────
export function listarSaldos(
  f: FiltrosSaldosUI,
  signal?: AbortSignal,
): Promise<RespostaLista<SaldoContextoDTO>> {
  return getJson(
    `/api/estoque/saldos${qs({
      materialId: f.materialId,
      local: f.local,
      unidade: f.unidade,
    })}`,
    signal,
  );
}

// ── Materiais (catalogo) ─────────────────────────────────────────────────────
export interface FiltrosMateriaisUI {
  natureza?: Natureza;
  categoria?: string;
  busca?: string;
  apenasAtivos?: boolean;
  pagina?: number;
  porPagina?: number;
}

export function listarMateriais(
  f: FiltrosMateriaisUI,
  signal?: AbortSignal,
): Promise<RespostaPaginada<MaterialDTO>> {
  return getJson(
    `/api/estoque/materiais${qs({
      natureza: f.natureza,
      categoria: f.categoria,
      busca: f.busca,
      apenasAtivos: f.apenasAtivos ? 'true' : undefined,
      pagina: f.pagina,
      porPagina: f.porPagina,
    })}`,
    signal,
  );
}

export function obterMaterial(id: string, signal?: AbortSignal): Promise<MaterialDTO> {
  return getJson(`/api/estoque/materiais/${id}`, signal);
}

export function criarMaterial(dados: UpsertMaterial): Promise<MaterialDTO> {
  return enviar('/api/estoque/materiais', 'POST', dados);
}

export function atualizarMaterial(
  id: string,
  dados: Partial<UpsertMaterial>,
): Promise<MaterialDTO> {
  return enviar(`/api/estoque/materiais/${id}`, 'PATCH', dados);
}

export interface RespostaExcluirMaterial {
  id: string;
  inativado: boolean;
  removido: boolean;
  material?: MaterialDTO;
}

export function excluirMaterial(id: string): Promise<RespostaExcluirMaterial> {
  return enviar(`/api/estoque/materiais/${id}`, 'DELETE');
}

// ── Locais ───────────────────────────────────────────────────────────────────
export function listarLocais(
  unidade?: UnidadeFisica,
  signal?: AbortSignal,
): Promise<RespostaLista<LocalDTO>> {
  return getJson(`/api/estoque/locais${qs({ unidade })}`, signal);
}

export interface UpsertLocalUI {
  unidade: UnidadeFisica;
  sala?: string | null;
  prateleira?: string | null;
  armario?: string | null;
  observacao?: string | null;
}

export function criarLocal(dados: UpsertLocalUI): Promise<LocalDTO> {
  return enviar('/api/estoque/locais', 'POST', dados);
}

export function atualizarLocal(id: string, dados: Partial<UpsertLocalUI>): Promise<LocalDTO> {
  return enviar(`/api/estoque/locais/${id}`, 'PATCH', dados);
}

export function excluirLocal(id: string): Promise<{ id: string; removido: boolean }> {
  return enviar(`/api/estoque/locais/${id}`, 'DELETE');
}

// ── Categorias ───────────────────────────────────────────────────────────────
export function listarCategorias(signal?: AbortSignal): Promise<RespostaLista<CategoriaDTO>> {
  return getJson('/api/estoque/categorias', signal);
}

export function criarCategoria(nome: string): Promise<CategoriaDTO> {
  return enviar('/api/estoque/categorias', 'POST', { nome });
}

export function atualizarCategoria(id: string, nome: string): Promise<CategoriaDTO> {
  return enviar(`/api/estoque/categorias/${id}`, 'PATCH', { nome });
}

export function excluirCategoria(id: string): Promise<{ id: string; removido: boolean }> {
  return enviar(`/api/estoque/categorias/${id}`, 'DELETE');
}

// ── Movimentacoes ────────────────────────────────────────────────────────────
export function listarMovimentacoes(
  f: FiltrosMovimentacoesUI,
  signal?: AbortSignal,
): Promise<RespostaPaginada<MovimentacaoTrilhaDTO>> {
  return getJson(
    `/api/estoque/movimentacoes${qs({
      tipo: f.tipo,
      unidadeId: f.unidadeId,
      materialId: f.materialId,
      local: f.local,
      pagina: f.pagina,
      porPagina: f.porPagina,
    })}`,
    signal,
  );
}

export function registrarMovimentacao(
  payload: PayloadMovimentacao,
): Promise<ResultadoMovimentacaoDTO> {
  return enviar('/api/estoque/movimentacoes', 'POST', payload);
}

// ── Exportacao Excel (XLSX) ──────────────────────────────────────────────────
// A rota `GET /api/estoque/export?tipo=...` gera o XLSX no servidor (auth por
// cookie de sessao) e responde com o arquivo como anexo. `tipo` seleciona a aba
// e reaproveita os MESMOS filtros da listagem correspondente. So montamos aqui a
// URL (querystring), ignorando valores vazios; o download em si e disparado pelo
// componente `BotaoExportarExcel`.

/** Filtros do export de movimentacoes. ATENCAO: o filtro de tipo de movimento
 *  vai como `tipoMov` (o param `tipo` ja seleciona a aba do export). */
export interface FiltrosExportMovimentacoes {
  tipoMov?: TipoMovimentacao;
  unidadeId?: string;
  materialId?: string;
  local?: string;
  usuarioId?: string;
  /** Data inicial (ISO). */
  de?: string;
  /** Data final (ISO). */
  ate?: string;
}

/** URL do export dos itens serializados (mesmos filtros da aba Serializados). */
export function urlExportarSerializado(f: FiltrosUnidadesUI): string {
  return `/api/estoque/export${qs({
    tipo: 'serializado',
    unidade: f.unidade,
    local: f.local,
    estado: f.estado,
    status: f.status,
    materialId: f.materialId,
    busca: f.busca,
  })}`;
}

/** URL do export dos materiais quantificaveis (filtros aceitos pelo backend:
 *  materialId/local/unidade). Categoria e busca da aba sao filtros de cliente e
 *  o backend nao os aceita, entao nao entram na querystring. */
export function urlExportarQuantificavel(f: FiltrosSaldosUI): string {
  return `/api/estoque/export${qs({
    tipo: 'quantificavel',
    materialId: f.materialId,
    local: f.local,
    unidade: f.unidade,
  })}`;
}

/** URL do export da trilha de movimentacoes. Sem filtro = trilha completa. */
export function urlExportarMovimentacoes(f: FiltrosExportMovimentacoes = {}): string {
  return `/api/estoque/export${qs({
    tipo: 'movimentacoes',
    tipoMov: f.tipoMov,
    unidadeId: f.unidadeId,
    materialId: f.materialId,
    local: f.local,
    usuarioId: f.usuarioId,
    de: f.de,
    ate: f.ate,
  })}`;
}
