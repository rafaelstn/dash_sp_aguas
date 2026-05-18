import 'server-only';

/**
 * Logger estruturado JSON — sem dependência externa.
 *
 * MOTIVAÇÃO
 *   Os endpoints já emitem `console.warn`/`console.error` com payload
 *   parcialmente estruturado (ex.: `seg.triagem.idor_blocked`). Esta camada
 *   centraliza o formato pra:
 *     1. Vercel Log Drains processarem JSON sem regex frágil.
 *     2. Alertas SIEM (`docs/runbooks/alertas-siem.md`) baterem em chaves
 *        estáveis (`evento`, `severidade`, `correlationId`).
 *     3. Auditoria de governo enxergar todos os campos obrigatórios sem
 *        precisar correlacionar 3 logs diferentes.
 *
 * NÃO INSTALAR PINO/WINSTON nesta sprint — o logger fica em ~30 linhas e
 * roda igualzinho no edge runtime. Migrar pra biblioteca só quando precisar
 * de transports externos (rare; Vercel Drains já cobrem).
 *
 * FORMATO DE SAÍDA (uma linha JSON em stdout/stderr):
 *   {
 *     "ts": "2026-05-08T12:34:56.789Z",
 *     "severidade": "warn",
 *     "evento": "seg.triagem.idor_blocked",
 *     "mensagem": "Tentativa de leitura cruzada bloqueada",
 *     "correlationId": "uuid-v4",     // opcional
 *     ...campos do contexto
 *   }
 *
 * REGRAS DE PII
 *   - NUNCA logar `dados` cru de ficha (campos hidrométricos podem ter PII
 *     residual mesmo que o schema não peça).
 *   - NUNCA logar token, senha, secret, body de password.
 *   - Email pode ir em log de segurança (login failed) — política do governo
 *     SP aceita pra detecção de phishing. Documentado.
 *
 * SEVERIDADES
 *   - debug: dev only (filtrado em prod via NODE_ENV).
 *   - info:  evento normal (sucesso, decisão).
 *   - warn:  anomalia que não bloqueia request (rate-limit, IDOR blocked).
 *   - error: 5xx, falha de infra, falha de invariante.
 *   - security: subset de warn/error que **alerta SIEM** — eventos com
 *     prefixo `seg.*` na chave `evento`. Forçado pra stderr.
 *
 * DRAIN HTTP OPCIONAL (modo Hobby — Sprint 1.S3.A)
 *   Como o projeto está em Vercel Hobby (sem Log Drains nativos), o logger
 *   pode opcionalmente enviar entradas via HTTP POST pra um endpoint
 *   externo (Better Stack, Logtail, Axiom, n8n, Slack incoming webhook,
 *   etc). Configuração 100% via env vars — sem deploy de código.
 *
 *   Env vars:
 *     LOG_DRAIN_URL          — endpoint HTTPS de destino. Ausente => drain inativo.
 *     LOG_DRAIN_TOKEN        — Bearer token (opcional). Se presente, vai em
 *                              `Authorization: Bearer <token>`.
 *     LOG_DRAIN_MIN_SEVERITY — severidade mínima a enviar (default: "security").
 *                              Aceita: debug | info | warn | error | security.
 *
 *   Comportamento:
 *     - Fire-and-forget: não bloqueia o handler que chamou o logger.
 *     - Timeout 2s por POST.
 *     - Falha silenciosa: erro vai pra console (sem disparar log → loop infinito).
 *     - Sem retry: aceito perder eventos ocasionais (monitoring auxiliar,
 *       não auditoria — auditoria é a tabela `auditoria` do Postgres).
 *     - Payload: mesmo JSON do stdout (formato canônico documentado acima).
 *     - Content-Type: `application/json`.
 *
 *   Quando ativar: ver `docs/runbooks/alertas-siem.md` §5.5. Decisão de
 *   canal (Slack? Better Stack? Logtail? Axiom?) postergada por Rafael.
 *   Logger fica pronto pra qualquer drain HTTP genérico — pivot é flip de
 *   env var.
 */

type Severidade = 'debug' | 'info' | 'warn' | 'error' | 'security';

interface LogEntry {
  ts: string;
  severidade: Severidade;
  evento: string;
  mensagem?: string;
  [campo: string]: unknown;
}

// Ordem ascendente de criticidade — usada pra comparar com LOG_DRAIN_MIN_SEVERITY.
const ordemSeveridade: Record<Severidade, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  security: 4,
};

function severidadeMinimaConfigurada(): Severidade {
  const valor = process.env.LOG_DRAIN_MIN_SEVERITY?.toLowerCase();
  if (
    valor === 'debug' ||
    valor === 'info' ||
    valor === 'warn' ||
    valor === 'error' ||
    valor === 'security'
  ) {
    return valor;
  }
  // Default: só eventos de segurança vão pro drain. Conservador — evita
  // saturar free tier do destino com info/debug. Override explícito via env.
  return 'security';
}

/**
 * Envia o log pro drain HTTP configurado, se houver. Não bloqueia o caller.
 *
 * Não usa o logger pra reportar próprios erros — evita loop infinito caso
 * o drain volte 5xx repetidamente.
 */
function despacharDrain(entry: LogEntry, linha: string): void {
  const url = process.env.LOG_DRAIN_URL;
  if (!url) return;

  const minimo = severidadeMinimaConfigurada();
  if (ordemSeveridade[entry.severidade] < ordemSeveridade[minimo]) return;

  const token = process.env.LOG_DRAIN_TOKEN;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // AbortController pra timeout 2s — evita request pendurada drenando o
  // budget de execução serverless (Vercel mata a função após o response).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);

  // Fire-and-forget. `void` deixa explícito que ignoramos a promise.
  // Catch silencioso: se logássemos a falha pelo próprio logger, e o drain
  // estivesse caído, criaríamos loop. console.error direto cai no Vercel
  // dashboard como fallback de visibilidade.
  void fetch(url, {
    method: 'POST',
    headers,
    body: linha,
    signal: controller.signal,
    // keepalive ajuda em finais de request — Node 20+ suporta.
    keepalive: true,
  })
    .catch((erro: unknown) => {
       
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          severidade: 'error',
          evento: 'logger.drain.falha',
          mensagem: 'Falha ao despachar log pro drain HTTP — caiu no fallback console.',
          motivo: erro instanceof Error ? erro.message : String(erro),
        }),
      );
    })
    .finally(() => {
      clearTimeout(timer);
    });
}

function emitir(entry: LogEntry): void {
  // JSON.stringify aceita undefined — vira ausência da chave (bom).
  // Em caso raríssimo de circular reference no contexto do chamador,
  // escapa com fallback simples pra não derrubar o handler.
  let linha: string;
  try {
    linha = JSON.stringify(entry);
  } catch {
    linha = JSON.stringify({
      ts: entry.ts,
      severidade: entry.severidade,
      evento: entry.evento,
      mensagem: entry.mensagem ?? 'log_serialization_failed',
      _aviso: 'contexto continha referência circular — descartado',
    });
  }

  // stderr para warn+, stdout para o resto. Vercel agrega ambos no Log
  // Drain; mantemos a separação pra ferramentas POSIX (`2>/dev/null`).
  if (entry.severidade === 'error' || entry.severidade === 'security') {
    process.stderr.write(linha + '\n');
  } else if (entry.severidade === 'warn') {
    process.stderr.write(linha + '\n');
  } else {
    process.stdout.write(linha + '\n');
  }

  // Drain HTTP opcional — ativa quando LOG_DRAIN_URL está configurado.
  // Sem env var => no-op, modo Hobby atual.
  despacharDrain(entry, linha);
}

function basico(severidade: Severidade) {
  return (
    evento: string,
    contexto?: Record<string, unknown>,
    mensagem?: string,
  ): void => {
    if (severidade === 'debug' && process.env.NODE_ENV === 'production') return;
    emitir({
      ts: new Date().toISOString(),
      severidade,
      evento,
      ...(mensagem !== undefined ? { mensagem } : {}),
      ...(contexto ?? {}),
    });
  };
}

/**
 * API mínima: 5 níveis. `security` é semanticamente um warn/error que
 * dispara alerta SIEM — mantenha a chave `evento` com prefixo `seg.*` para
 * o roteador do alerta funcionar (ver `docs/runbooks/alertas-siem.md`).
 *
 * Exemplo:
 *   logger.security('seg.triagem.idor_blocked', {
 *     triagemId, usuarioId, donoId, estado,
 *   }, 'Tentativa de leitura cruzada bloqueada');
 */
export const logger = {
  debug: basico('debug'),
  info: basico('info'),
  warn: basico('warn'),
  error: basico('error'),
  security: basico('security'),
};

export type { LogEntry, Severidade };
