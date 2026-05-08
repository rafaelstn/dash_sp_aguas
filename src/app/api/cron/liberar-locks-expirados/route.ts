import { NextResponse, type NextRequest } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { triagemRepository } from '@/infrastructure/repositories';
import { liberarLocksExpirados } from '@/application/use-cases/triagem/liberar-locks-expirados';
import {
  POLITICAS,
  consumirRateLimit,
  extrairIp,
} from '@/infrastructure/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/cron/liberar-locks-expirados
 * Endpoint protegido por header `x-cron-secret: $CRON_SECRET`.
 *
 * Roda em cron (Vercel Cron) a cada N minutos. Idempotente — chamar 2x não
 * gera efeitos extras além de logar zero liberações.
 *
 * Comparação em tempo constante via `crypto.timingSafeEqual` (Node nativo) —
 * evita timing attack na descoberta do secret. Strings de comprimento
 * diferente são padded antes do compare para também esconder o length da
 * string recebida (defesa adicional, baixa criticidade).
 *
 * Bypass do rate limit: este endpoint NÃO consome o token bucket do
 * `rate-limit.ts` — chamado só pelo Vercel Cron com IP fixo. Se o secret
 * vazasse e atacante tentasse chamar com força bruta, a única defesa é o
 * próprio compare constante; sem rate limit aqui é decisão consciente.
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

export async function POST(request: NextRequest) {
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
    console.error('[cron liberar-locks] CRON_SECRET ausente ou curto demais');
    return NextResponse.json(
      { erro: 'configuracao_invalida' },
      { status: 500 },
    );
  }

  const recebido = request.headers.get('x-cron-secret') ?? '';
  if (!compareSecretsConstantTime(recebido, secretEnv)) {
    // Não diferencia "ausente" de "errado" — mesma resposta, mesmo tempo.
    return NextResponse.json({ erro: 'nao_autorizado' }, { status: 401 });
  }

  try {
    const resultado = await liberarLocksExpirados(triagemRepository);
    if (resultado.quantidade > 0) {
      console.info('[cron liberar-locks] liberados', resultado);
    }
    return NextResponse.json(resultado);
  } catch (e) {
    // String(e) escapa stack — toString do Error não inclui stack por padrão.
    console.error('[cron liberar-locks] falha', String(e));
    return NextResponse.json(
      { erro: 'erro_interno' },
      { status: 500 },
    );
  }
}
