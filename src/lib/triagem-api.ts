/**
 * Cliente HTTP do módulo de triagem.
 *
 * Centraliza as chamadas a `/api/triagem/*` num único módulo. Server
 * Components fazem as leituras (sem cache, sempre fresh) e o Client
 * Component dispara as mutações via Server Actions OU direto via fetch
 * relativo (mantém o cookie de sessão).
 *
 * Os contratos espelham exatamente os endpoints implementados pelo Lucas
 * em `src/app/api/triagem/*` e `ops/testing/triagem-flow.http`.
 */

import type { FichaTriagem } from '@/domain/triagem';
import type { EventoTriagem } from '@/domain/triagem-evento';

// ─────────────────────────────────────────────────────────────────────────
// Wire types — JSON serializado pelo NextResponse.json. As datas viram
// strings ISO; convertemos no parse abaixo.
// ─────────────────────────────────────────────────────────────────────────

interface FichaTriagemWire
  extends Omit<
    FichaTriagem,
    'dataVisita' | 'decididaEm' | 'criadaEm' | 'atualizadaEm'
  > {
  dataVisita: string;
  decididaEm: string | null;
  criadaEm: string;
  atualizadaEm: string;
}

interface EventoTriagemWire extends Omit<EventoTriagem, 'ocorreuEm'> {
  ocorreuEm: string;
}

function reidratarFicha(w: FichaTriagemWire): FichaTriagem {
  return {
    ...w,
    dataVisita: new Date(w.dataVisita),
    decididaEm: w.decididaEm ? new Date(w.decididaEm) : null,
    criadaEm: new Date(w.criadaEm),
    atualizadaEm: new Date(w.atualizadaEm),
  };
}

function reidratarEvento(w: EventoTriagemWire): EventoTriagem {
  return { ...w, ocorreuEm: new Date(w.ocorreuEm) };
}

// ─────────────────────────────────────────────────────────────────────────
// Tipos públicos
// ─────────────────────────────────────────────────────────────────────────

export interface FiltrosListaTriagem {
  codTipoDocumento?: number;
  prefixo?: string;
  desde?: string; // YYYY-MM-DD
  ate?: string;
  limite?: number;
  offset?: number;
}

export interface RespostaListaTriagem {
  itens: FichaTriagem[];
  total: number;
}

export interface RespostaDetalheTriagem {
  ficha: FichaTriagem;
  eventos: EventoTriagem[];
}

/**
 * Erro tipado das chamadas de mutação. Carrega o `slug` do backend
 * (`erro` no body) pra que a UI mapeie pra mensagem em pt-BR formal.
 */
export class ErroTriagemAPI extends Error {
  constructor(
    public readonly status: number,
    public readonly slug: string,
    public readonly mensagem: string,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(mensagem);
    this.name = 'ErroTriagemAPI';
  }
}

interface CorpoErroAPI {
  erro?: string;
  mensagem?: string;
  motivos?: string[];
  motivo?: string;
  tamanhoRecebido?: number;
  fichaExistenteId?: string;
  de?: string;
  para?: string;
}

async function tratarErro(resp: Response): Promise<never> {
  let body: CorpoErroAPI = {};
  try {
    body = (await resp.json()) as CorpoErroAPI;
  } catch {
    // resposta sem JSON
  }
  const slug = body.erro ?? `http_${resp.status}`;
  const mensagem =
    body.mensagem ??
    body.motivos?.join('; ') ??
    `Falha na requisição (HTTP ${resp.status}).`;
  throw new ErroTriagemAPI(
    resp.status,
    slug,
    mensagem,
    body as unknown as Record<string, unknown>,
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Server-side: leituras chamadas em Server Components passando cookies.
// O fetch relativo do Next 15 dentro de RSC herda os cookies da request,
// então precisamos só do `cache: 'no-store'`.
// ─────────────────────────────────────────────────────────────────────────

function paraQueryString(filtros: FiltrosListaTriagem): string {
  const usp = new URLSearchParams();
  if (filtros.codTipoDocumento !== undefined) {
    usp.set('codTipoDocumento', String(filtros.codTipoDocumento));
  }
  if (filtros.prefixo) usp.set('prefixo', filtros.prefixo);
  if (filtros.desde) usp.set('desde', filtros.desde);
  if (filtros.ate) usp.set('ate', filtros.ate);
  if (filtros.limite !== undefined) usp.set('limite', String(filtros.limite));
  if (filtros.offset !== undefined) usp.set('offset', String(filtros.offset));
  const s = usp.toString();
  return s ? `?${s}` : '';
}

// ─────────────────────────────────────────────────────────────────────────
// Client-side: mutações chamadas a partir de event handlers em CCs.
// fetch relativo na mesma origem carrega o cookie de sessão automaticamente.
// ─────────────────────────────────────────────────────────────────────────

async function chamadaMutacao(
  caminho: string,
  corpo?: unknown,
): Promise<unknown> {
  const init: RequestInit = {
    method: 'POST',
    credentials: 'same-origin',
    headers: corpo
      ? { 'Content-Type': 'application/json', Accept: 'application/json' }
      : { Accept: 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined,
    cache: 'no-store',
  };
  const resp = await fetch(caminho, init);
  if (!resp.ok) await tratarErro(resp);
  try {
    return (await resp.json()) as unknown;
  } catch {
    return {};
  }
}

export async function iniciarRevisaoCliente(
  triagemId: string,
): Promise<{ ficha: FichaTriagem; lock: { expiraEm: Date } }> {
  const r = (await chamadaMutacao(`/api/triagem/${triagemId}/iniciar-revisao`)) as {
    ficha: FichaTriagemWire;
    lock: { expiraEm: string };
  };
  return {
    ficha: reidratarFicha(r.ficha),
    lock: { expiraEm: new Date(r.lock.expiraEm) },
  };
}

export async function aprovarTriagemCliente(
  triagemId: string,
): Promise<{ triagem: FichaTriagem; fichaVisitaId: string }> {
  const r = (await chamadaMutacao(`/api/triagem/${triagemId}/aprovar`)) as {
    triagem: FichaTriagemWire;
    fichaVisitaId: string;
  };
  return { triagem: reidratarFicha(r.triagem), fichaVisitaId: r.fichaVisitaId };
}

export async function rejeitarTriagemCliente(
  triagemId: string,
  motivo: string,
): Promise<{ triagem: FichaTriagem }> {
  const r = (await chamadaMutacao(`/api/triagem/${triagemId}/rejeitar`, {
    motivo,
  })) as { triagem: FichaTriagemWire };
  return { triagem: reidratarFicha(r.triagem) };
}

export async function devolverTriagemCliente(
  triagemId: string,
  motivo: string,
): Promise<{ triagem: FichaTriagem }> {
  const r = (await chamadaMutacao(`/api/triagem/${triagemId}/devolver`, {
    motivo,
  })) as { triagem: FichaTriagemWire };
  return { triagem: reidratarFicha(r.triagem) };
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers de UI compartilhados (puros — não dependem de DOM).
// ─────────────────────────────────────────────────────────────────────────

/**
 * Mapeia o `slug` do erro do backend pra mensagem formal exibida ao
 * aprovador. Cada slug aqui é um contrato com `_helpers.ts` da API.
 */
export function mensagemErroTriagem(erro: ErroTriagemAPI): string {
  switch (erro.slug) {
    case 'lock_negado':
      if (erro.extra && (erro.extra as { motivo?: string }).motivo === 'ja_existe_lock') {
        return 'Outro aprovador iniciou a revisão. Aguarde a liberação automática ou contate o aprovador atual.';
      }
      if (erro.extra && (erro.extra as { motivo?: string }).motivo === 'nao_dono_do_lock') {
        return 'O lock de revisão pertence a outro aprovador.';
      }
      return 'Lock de revisão indisponível para esta ficha.';
    case 'estado_invalido':
      return 'A ficha já foi decidida. Recarregue a página para visualizar o estado atual.';
    case 'mfa_obrigatorio':
      return 'Esta operação exige MFA verificado. Configure o segundo fator no seu perfil antes de continuar.';
    case 'sem_papel_aprovador':
      return 'Operação requer papel de aprovador.';
    case 'motivo_insuficiente':
      return 'O motivo precisa ter ao menos 20 caracteres descrevendo o problema identificado.';
    case 'nao_encontrada':
      return 'Ficha de triagem não encontrada.';
    case 'rate_limit':
      return 'Limite de requisições atingido. Aguarde alguns instantes e tente novamente.';
    case 'nao_autenticado':
      return 'Sessão expirada. Faça login novamente.';
    default:
      return erro.mensagem || 'Falha ao processar a solicitação.';
  }
}

/**
 * Tempo relativo em pt-BR a partir de uma data.
 * "há 3 minutos", "há 2 horas", "há 5 dias", "agora".
 */
export function tempoRelativo(data: Date, agora: Date = new Date()): string {
  const ms = agora.getTime() - data.getTime();
  if (ms < 0) {
    return tempoRelativoFuturo(-ms);
  }
  const seg = Math.floor(ms / 1000);
  if (seg < 30) return 'agora';
  if (seg < 60) return `há ${seg} segundos`;
  const min = Math.floor(seg / 60);
  if (min < 60) return min === 1 ? 'há 1 minuto' : `há ${min} minutos`;
  const h = Math.floor(min / 60);
  if (h < 24) return h === 1 ? 'há 1 hora' : `há ${h} horas`;
  const d = Math.floor(h / 24);
  if (d < 7) return d === 1 ? 'há 1 dia' : `há ${d} dias`;
  const sem = Math.floor(d / 7);
  if (sem < 4) return sem === 1 ? 'há 1 semana' : `há ${sem} semanas`;
  const mes = Math.floor(d / 30);
  if (mes < 12) return mes === 1 ? 'há 1 mês' : `há ${mes} meses`;
  const ano = Math.floor(d / 365);
  return ano === 1 ? 'há 1 ano' : `há ${ano} anos`;
}

function tempoRelativoFuturo(ms: number): string {
  const seg = Math.floor(ms / 1000);
  if (seg < 60) return seg <= 1 ? 'em instantes' : `em ${seg} segundos`;
  const min = Math.floor(seg / 60);
  if (min < 60) return min === 1 ? 'em 1 minuto' : `em ${min} minutos`;
  const h = Math.floor(min / 60);
  return h === 1 ? 'em 1 hora' : `em ${h} horas`;
}

// ─────────────────────────────────────────────────────────────────────────
// Fetch utilitário pra Server Components — recebe a base absoluta da
// request atual via headers() pra que o fetch interno carregue o cookie.
// ─────────────────────────────────────────────────────────────────────────

export const triagemAPI = {
  reidratarFicha,
  reidratarEvento,
  paraQueryString,
};
