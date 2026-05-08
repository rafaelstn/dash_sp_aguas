import { NextResponse, type NextRequest } from 'next/server';
import { triagemRepository } from '@/infrastructure/repositories';
import { liberarLocksExpirados } from '@/application/use-cases/triagem/liberar-locks-expirados';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/cron/liberar-locks-expirados
 * Endpoint protegido por header `x-cron-secret: $CRON_SECRET`.
 *
 * Roda em cron (Vercel Cron) a cada N minutos. Idempotente — chamar 2x não
 * gera efeitos extras além de logar zero liberações.
 *
 * Comparação em tempo constante para evitar timing attacks na descoberta do
 * secret. Sem secret válido = 401 sem dica.
 */
function comparaConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let acc = 0;
  for (let i = 0; i < a.length; i += 1) {
    acc |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return acc === 0;
}

export async function POST(request: NextRequest) {
  const secretEnv = process.env.CRON_SECRET;
  if (!secretEnv) {
    console.error('[cron liberar-locks] CRON_SECRET não configurado');
    return NextResponse.json(
      { erro: 'configuracao_invalida' },
      { status: 500 },
    );
  }

  const recebido = request.headers.get('x-cron-secret') ?? '';
  if (!comparaConstante(recebido, secretEnv)) {
    return NextResponse.json({ erro: 'nao_autorizado' }, { status: 401 });
  }

  try {
    const resultado = await liberarLocksExpirados(triagemRepository);
    if (resultado.quantidade > 0) {
      console.info('[cron liberar-locks] liberados', resultado);
    }
    return NextResponse.json(resultado);
  } catch (e) {
    console.error('[cron liberar-locks] falha', String(e));
    return NextResponse.json(
      { erro: 'erro_interno' },
      { status: 500 },
    );
  }
}
