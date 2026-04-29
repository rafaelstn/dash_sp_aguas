import { NextResponse } from 'next/server';
import { sql } from '@/infrastructure/db/client';
import { getEnv } from '@/infrastructure/config/env';

export async function GET() {
  if (getEnv().isDemoMode) {
    return NextResponse.json(
      { status: 'ok', db: 'demo', modo: 'demo' },
      { status: 200 },
    );
  }
  try {
    await sql`SELECT 1`;
    return NextResponse.json({ status: 'ok', db: 'ok' }, { status: 200 });
  } catch (e) {
    // Diagnóstico: expõe detalhes do erro no body em ambiente não-produtivo
    // OU quando flag de diagnóstico está ligada. Pra produção fechada,
    // remover após resolver.
    const detalhe =
      e instanceof Error
        ? {
            name: e.name,
            message: e.message,
            code: (e as { code?: string }).code ?? null,
            severity: (e as { severity?: string }).severity ?? null,
          }
        : { raw: String(e) };
    console.error('[api/health] DB connect fail', detalhe);
    return NextResponse.json(
      { status: 'degraded', db: 'erro', detalhe },
      { status: 503 },
    );
  }
}
