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
    // Loga detalhe pra debug nos logs do Vercel; resposta pública genérica.
    console.error('[api/health] DB connect fail', {
      name: e instanceof Error ? e.name : 'Unknown',
      message: e instanceof Error ? e.message : String(e),
      code: e instanceof Error ? (e as { code?: string }).code : null,
    });
    return NextResponse.json(
      { status: 'degraded', db: 'erro' },
      { status: 503 },
    );
  }
}
