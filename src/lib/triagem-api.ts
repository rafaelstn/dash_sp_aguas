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

import { mensagemAcessoRestrito } from '@/domain/auth/mensagem-acesso-restrito';
import type { FichaTriagem } from '@/domain/triagem';

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

function reidratarFicha(w: FichaTriagemWire): FichaTriagem {
  return {
    ...w,
    dataVisita: new Date(w.dataVisita),
    decididaEm: w.decididaEm ? new Date(w.decididaEm) : null,
    criadaEm: new Date(w.criadaEm),
    atualizadaEm: new Date(w.atualizadaEm),
  };
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
// Submissão pelo app móvel — endpoint /api/app/fichas (Lucas).
// Difere das mutações acima porque carrega `Idempotency-Key` no header e
// pode retornar 201 (criada nova) ou 200 (idempotência → ficha existente).
// ─────────────────────────────────────────────────────────────────────────

export interface CorpoSubmissaoApp {
  prefixo: string;
  codTipoDocumento: number;
  dataVisita: string; // YYYY-MM-DD
  horaInicio?: string | null;
  horaFim?: string | null;
  tecnicoNome: string;
  latitudeCapturada?: number | null;
  longitudeCapturada?: number | null;
  precisaoGpsM?: number | null;
  observacoes?: string | null;
  dados: Record<string, unknown>;
  fichaOrigemId?: string | null;
}

export interface RespostaSubmissaoApp {
  id: string;
  estado: string;
  criadaEm: string;
}

/**
 * Submete ficha pelo app móvel (`POST /api/app/fichas`). O backend valida
 * o payload com `construirSchemaZodEstrito` (André) — usar a mesma função
 * no cliente antes do submit pra falhar barato e exibir erro inline.
 *
 * `idempotencyKey` é enviada no header `Idempotency-Key`. O cliente deve
 * persistir essa chave junto com o rascunho e reusar entre tentativas
 * para garantir idempotência (Lucas trata na repository.submeter).
 */
export async function submeterFichaApp(
  corpo: CorpoSubmissaoApp,
  idempotencyKey: string,
): Promise<RespostaSubmissaoApp> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'Idempotency-Key': idempotencyKey,
  };
  const resp = await fetch('/api/app/fichas', {
    method: 'POST',
    credentials: 'same-origin',
    headers,
    body: JSON.stringify(corpo),
    cache: 'no-store',
  });
  if (!resp.ok) await tratarErro(resp);
  return (await resp.json()) as RespostaSubmissaoApp;
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers de UI compartilhados (puros — não dependem de DOM).
// ─────────────────────────────────────────────────────────────────────────

/**
 * Mapeia o `slug` do erro do backend para a mensagem formal exibida ao
 * aprovador (governo SP — tom institucional, terceira pessoa, sem
 * culpabilização do usuário). Cada slug aqui é um contrato com os
 * endpoints em `src/app/api/triagem/*` e `src/app/api/app/fichas/route.ts`.
 *
 * Slugs cobertos:
 *   `nao_autenticado`               (401)
 *   `rate_limit`                    (429)
 *   `id_invalido` , `query_invalida`, `body_invalido`, `json_invalido` (400)
 *   `dados_invalidos`               (422, Zod do payload)
 *   `motivo_insuficiente`           (400, justificativa < 20 chars)
 *   `tipo_indisponivel`             (409, schema da ficha não habilitado)
 *   `nao_encontrada`                (404)
 *   `sem_papel_aprovador`           (403)
 *   `estado_invalido`               (409, ficha já decidida)
 *   `lock_negado`                   (409, disputa de revisão)
 *   `idempotency_duplicada`         (409, Idempotency-Key reaproveitada)
 *   `idempotency_invalida`          (400, UUIDv4 inválido)
 *   `erro_interno`                  (500)
 */
export function mensagemErroTriagem(erro: ErroTriagemAPI): string {
  switch (erro.slug) {
    case 'nao_autenticado':
      return 'A sessão expirou. Acesse o sistema novamente para continuar.';

    case 'rate_limit':
      return 'Limite de requisições atingido. Aguarde alguns instantes antes de tentar novamente.';

    case 'id_invalido':
      return 'Identificador da ficha em formato inválido. Recarregue a página para reabrir o registro.';

    case 'query_invalida':
      return 'Os filtros informados estão em formato inválido. Revise os campos antes de aplicar novamente.';

    case 'body_invalido':
    case 'json_invalido':
      return 'Os dados submetidos estão em formato inválido. Recarregue a página e tente novamente.';

    case 'dados_invalidos':
      return 'A ficha contém campos com valores incompatíveis com este tipo. Revise as informações antes de submeter novamente.';

    case 'motivo_insuficiente':
      return 'A justificativa precisa ter ao menos 20 caracteres descrevendo o problema identificado.';

    case 'tipo_indisponivel':
      return 'O tipo de ficha selecionado não está habilitado para submissão no momento. Contate o gestor responsável.';

    case 'nao_encontrada':
      return 'Ficha de triagem não localizada. É possível que tenha sido removida ou que o identificador esteja incorreto.';

    case 'sem_papel_aprovador':
      // Fonte única do texto (domain/auth/mensagem-acesso-restrito). Aqui é
      // sempre a variante padrão: este mapeamento roda no navegador e não
      // enxerga a janela sem identidade. Na prática ela não é alcançável
      // durante a janela, porque a tela de triagem recusa antes de qualquer
      // chamada. Se a API passar a ser chamada de outro lugar, este é o ponto
      // que precisa receber a variante correta.
      return mensagemAcessoRestrito(false);

    case 'estado_invalido':
      return 'A ficha já foi decidida. Recarregue a página para visualizar a situação atual.';

    case 'lock_negado': {
      const motivoLock = (erro.extra as { motivo?: string } | undefined)?.motivo;
      if (motivoLock === 'ja_existe_lock') {
        return 'Outro aprovador iniciou a revisão desta ficha. Aguarde a liberação automática ou contate o aprovador responsável.';
      }
      if (motivoLock === 'nao_dono_do_lock') {
        return 'A reserva da revisão pertence a outro aprovador. Inicie a revisão para retomar a ficha.';
      }
      return 'Reserva de revisão indisponível para esta ficha no momento.';
    }

    case 'idempotency_duplicada':
      return 'Esta submissão já foi registrada anteriormente. Recarregue a página para verificar a ficha existente.';

    case 'idempotency_invalida':
      return 'Identificador de idempotência em formato inválido. Recarregue a página e tente novamente.';

    case 'erro_interno':
      return 'Falha interna do sistema. Tente novamente em instantes. Se o erro persistir, contate o administrador do sistema.';

    default:
      return (
        erro.mensagem ||
        'Não foi possível concluir a operação. Tente novamente em instantes.'
      );
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

