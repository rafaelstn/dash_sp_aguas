import 'server-only';

/**
 * Rate limit Camada 1 — in-memory por instância (Vercel/Node serverful).
 *
 * Limitação conhecida (documentada no checklist de segurança §6.2):
 *   - Reset por deploy (cada instância tem seu próprio Map).
 *   - Não distribuído entre regions.
 *
 * Suficiente pra MVP. Camada 2 (Upstash Redis) será plugada quando
 * Rafael aprovar orçamento — usar mesmo contrato pra trocar implementação.
 *
 * Algoritmo: token bucket simples — janela deslizante de N segundos,
 * capacidade `limite`. Refil contínuo proporcional ao tempo decorrido.
 */

interface Bucket {
  tokens: number;
  ultimaRecarga: number;
}

const buckets = new Map<string, Bucket>();

// Limpeza preguiçosa: dispara a cada N inserções OU a cada N segundos —
// o que vier antes. Defesa contra memory leak: atacante mandando 10k chaves
// distintas em 1s não bloqueia limpeza pela barreira de tempo.
let inserts = 0;
let ultimaLimpeza = Date.now();
const LIMPEZA_A_CADA_INSERTS = 1000;
const LIMPEZA_A_CADA_MS = 60 * 1000; // 1 min de piso temporal
const TTL_BUCKET_MS = 10 * 60 * 1000;
// Limite duro de buckets pra evitar OOM mesmo com flood — se exceder,
// força limpeza imediata. 50k buckets ~ poucos MB.
const LIMITE_HARD_BUCKETS = 50_000;

function limparAntigos(): void {
  const corte = Date.now() - TTL_BUCKET_MS;
  for (const [k, b] of buckets.entries()) {
    if (b.ultimaRecarga < corte) buckets.delete(k);
  }
  ultimaLimpeza = Date.now();
}

function talvezLimpar(): void {
  if (
    inserts % LIMPEZA_A_CADA_INSERTS === 0 ||
    Date.now() - ultimaLimpeza > LIMPEZA_A_CADA_MS ||
    buckets.size > LIMITE_HARD_BUCKETS
  ) {
    limparAntigos();
  }
}

export interface ConfiguracaoRateLimit {
  /** Identificador único da política (ex.: 'submeter-ficha'). */
  politica: string;
  /** Capacidade máxima do bucket (=limite por janela). */
  limite: number;
  /** Janela em segundos. */
  janelaSegundos: number;
}

export interface ResultadoRateLimit {
  permitido: boolean;
  remanescente: number;
  resetEm: number; // epoch ms
  retryAposSeg?: number;
}

/**
 * Tenta consumir 1 token do bucket identificado por (politica, chave).
 *
 * @param chave geralmente userId ou IP (decisor: caller).
 */
export function consumirRateLimit(
  config: ConfiguracaoRateLimit,
  chave: string,
): ResultadoRateLimit {
  const id = `${config.politica}:${chave}`;
  const agora = Date.now();
  const taxaPorMs = config.limite / (config.janelaSegundos * 1000);

  let bucket = buckets.get(id);
  if (!bucket) {
    bucket = { tokens: config.limite, ultimaRecarga: agora };
    buckets.set(id, bucket);
    inserts += 1;
    talvezLimpar();
  }

  // Refil proporcional ao tempo decorrido desde última checagem.
  const decorrido = agora - bucket.ultimaRecarga;
  bucket.tokens = Math.min(
    config.limite,
    bucket.tokens + decorrido * taxaPorMs,
  );
  bucket.ultimaRecarga = agora;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    const remanescente = Math.floor(bucket.tokens);
    return {
      permitido: true,
      remanescente,
      resetEm: agora + config.janelaSegundos * 1000,
    };
  }

  // Calcula em quantos segundos terá 1 token.
  const faltaTokens = 1 - bucket.tokens;
  const retryMs = Math.ceil(faltaTokens / taxaPorMs);
  return {
    permitido: false,
    remanescente: 0,
    resetEm: agora + retryMs,
    retryAposSeg: Math.ceil(retryMs / 1000),
  };
}

/**
 * Helpers para extrair identificadores comuns. IP segue ordem de
 * preferência: x-forwarded-for > x-real-ip > 'unknown'.
 */
export function extrairIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0]!.trim();
  const xri = req.headers.get('x-real-ip');
  if (xri) return xri.trim();
  return 'unknown';
}

/**
 * Políticas pré-definidas para o módulo de triagem (ver
 * `docs/seguranca/checklist-modulo-mobile.md §6.3`).
 */
export const POLITICAS = {
  submeterFicha: {
    politica: 'submeter-ficha',
    limite: 30,
    janelaSegundos: 60,
  },
  submeterFichaIp: {
    politica: 'submeter-ficha-ip',
    limite: 100,
    janelaSegundos: 60,
  },
  decisaoTriagem: {
    politica: 'decisao-triagem',
    limite: 60,
    janelaSegundos: 60,
  },
  leituraTriagem: {
    politica: 'leitura-triagem',
    limite: 200,
    janelaSegundos: 60,
  },
  /**
   * Política aplicada à invocação do cron (`/api/cron/*`) por IP. Vercel Cron
   * dispara raramente (cada 5–60min) — limite generoso, mas presente para
   * conter brute-force do `x-cron-secret` se atacante descobrir o endpoint.
   * Combina com `crypto.timingSafeEqual` no compare do secret.
   */
  cronInvocacao: {
    politica: 'cron-invocacao-ip',
    limite: 60,
    janelaSegundos: 60,
  },
  /** Leitura geral do módulo Inventário ANA (lista, detalhe, painel). */
  leituraInventarioAna: {
    politica: 'leitura-inventario-ana',
    limite: 200,
    janelaSegundos: 60,
  },
  /** Mutações no Inventário ANA (revisar, bulk, exportar). */
  decisaoInventarioAna: {
    politica: 'decisao-inventario-ana',
    limite: 60,
    janelaSegundos: 60,
  },
} satisfies Record<string, ConfiguracaoRateLimit>;

/** Headers HTTP padrão pra resposta — chamar após consumir. */
export function aplicarHeadersRateLimit(
  headers: Headers,
  config: ConfiguracaoRateLimit,
  resultado: ResultadoRateLimit,
): void {
  headers.set('X-RateLimit-Limit', String(config.limite));
  headers.set('X-RateLimit-Remaining', String(resultado.remanescente));
  headers.set('X-RateLimit-Reset', String(Math.floor(resultado.resetEm / 1000)));
  if (!resultado.permitido && resultado.retryAposSeg !== undefined) {
    headers.set('Retry-After', String(resultado.retryAposSeg));
  }
}
