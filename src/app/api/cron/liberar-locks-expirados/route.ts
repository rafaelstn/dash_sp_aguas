import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { triagemRepository } from '@/infrastructure/repositories';
import { liberarLocksExpirados } from '@/application/use-cases/triagem/liberar-locks-expirados';
import {
  POLITICAS,
  consumirRateLimit,
  extrairIp,
} from '@/infrastructure/security/rate-limit';
import { logger } from '@/infrastructure/logging/logger';
import { respostaDeErro } from '@/app/api/_helpers/erros';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET|POST /api/cron/liberar-locks-expirados
 *
 * Endpoint dual-method protegido por secret em header (timing-safe compare):
 *
 *   - **GET**: usado pelo **Vercel Cron**. A plataforma envia automaticamente
 *     `Authorization: Bearer ${CRON_SECRET}` quando o env var existe. Não dá
 *     para configurar headers customizados em vercel.json (limitação da
 *     plataforma — ver `docs/runbooks/vercel-cron.md`).
 *   - **POST**: usado para **chamadas manuais** (ex.: rotação de secret,
 *     debugging, testes locais com curl). Lê `x-cron-secret` ou `Authorization`.
 *
 * Roda em cron (Vercel Cron) a cada 5min — vercel.json. Idempotente: chamar
 * 2x não gera efeitos extras além de logar zero liberações.
 *
 * Comparação em tempo constante via `crypto.timingSafeEqual` (Node nativo) —
 * evita timing attack na descoberta do secret. Strings de comprimento
 * diferente são padded antes do compare para também esconder o length da
 * string recebida (defesa adicional, baixa criticidade).
 *
 * Heartbeat: emitido sempre que o use case completa com sucesso (em
 * `liberarLocksExpirados`) — ver tabela `cron_heartbeats` (migration 0027)
 * e alerta A3 em `docs/runbooks/alertas-siem.md`.
 */
function compareSecretsConstantTime(received: string, expected: string): boolean {
  // Padding pra mesmo length antes do timingSafeEqual (que exige tamanhos iguais).
  // O valor do secret esperado nunca aparece no log/erro por construção.
  const a = Buffer.from(received, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) {
    // Faz um compare dummy do mesmo tamanho de `b` pra não vazar timing por
    // early-return. O resultado já é falso.
    const dummy = Buffer.alloc(b.length);
    timingSafeEqual(dummy, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

/**
 * Extrai o secret do request, aceitando dois formatos:
 *   1. `Authorization: Bearer <secret>` — usado pelo Vercel Cron e padrão
 *      na maioria das ferramentas.
 *   2. `x-cron-secret: <secret>` — chamada manual em curl/local.
 *
 * A função sempre retorna string (vazia se ausente) pra alimentar o
 * timing-safe compare que padroniza tempo independente do header presente.
 */
function extrairSecret(request: NextRequest): string {
  const auth = request.headers.get('authorization');
  if (auth?.startsWith('Bearer ')) {
    return auth.slice('Bearer '.length);
  }
  return request.headers.get('x-cron-secret') ?? '';
}

async function executar(request: NextRequest) {
  // Rate limit por IP — defesa em profundidade contra brute-force do secret.
  // Vercel Cron dispara poucas vezes; um IP atingindo 60+/min é suspeito.
  const ip = extrairIp(request);
  const rl = consumirRateLimit(POLITICAS.cronInvocacao, ip);
  if (!rl.permitido) {
    return NextResponse.json(
      { erro: 'rate_limit' },
      { status: 429 },
    );
  }

  const secretEnv = process.env.CRON_SECRET;
  if (!secretEnv || secretEnv.length < 32) {
    // Não loga o valor — só a falha de config. < 32 chars é considerado
    // misconfig (o gerador de secret deve usar ≥ 32 bytes random).
    logger.error(
      'cron.config_invalida',
      { job: 'triagem-liberar-locks-expirados' },
      'CRON_SECRET ausente ou curto demais',
    );
    return NextResponse.json(
      { erro: 'configuracao_invalida' },
      { status: 500 },
    );
  }

  const recebido = extrairSecret(request);
  if (!compareSecretsConstantTime(recebido, secretEnv)) {
    // Não diferencia "ausente" de "errado" — mesma resposta, mesmo tempo.
    return NextResponse.json({ erro: 'nao_autorizado' }, { status: 401 });
  }

  try {
    const resultado = await liberarLocksExpirados(triagemRepository);
    if (resultado.quantidade > 0) {
      logger.info(
        'cron.liberar_locks.sucesso',
        {
          job: 'triagem-liberar-locks-expirados',
          quantidade: resultado.quantidade,
          liberados: resultado.liberados,
          duracaoMs: resultado.duracaoMs,
        },
        `${resultado.quantidade} lock(s) liberado(s)`,
      );
    }
    return NextResponse.json(resultado);
  } catch (e) {
    // Log específico do cron mantido: severity `error` alimenta alerta A3/A4
    // (ver alertas-siem.md). O respostaDeErro adiciona o correlationId e o
    // fallback 5xx uniforme da API.
    logger.error(
      'cron.liberar_locks.falha',
      { job: 'triagem-liberar-locks-expirados', erro: String(e) },
      'Falha ao executar cron de liberação de locks',
    );
    return respostaDeErro(
      'POST /api/cron/liberar-locks-expirados',
      { job: 'triagem-liberar-locks-expirados' },
      e,
    );
  }
}

// Vercel Cron sempre dispara GET. POST mantido para chamadas manuais.
export const GET = executar;
export const POST = executar;
