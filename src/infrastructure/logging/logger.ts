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
 */

type Severidade = 'debug' | 'info' | 'warn' | 'error' | 'security';

interface LogEntry {
  ts: string;
  severidade: Severidade;
  evento: string;
  mensagem?: string;
  [campo: string]: unknown;
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
