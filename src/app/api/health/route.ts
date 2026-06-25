import { NextResponse } from 'next/server';
import { sql } from '@/infrastructure/db/client';
import { getEnv } from '@/infrastructure/config/env';
import { logger } from '@/infrastructure/logging/logger';

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
    logger.error(
      'health.db.falha',
      {
        nome: e instanceof Error ? e.name : 'Unknown',
        motivo: e instanceof Error ? e.message : String(e),
        codigo: e instanceof Error ? (e as { code?: string }).code : null,
      },
      'Falha ao conectar no banco',
    );
    return NextResponse.json(
      { status: 'degraded', db: 'erro' },
      { status: 503 },
    );
  }
}
