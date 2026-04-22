import { NextResponse } from 'next/server';
import { sql } from '@/infrastructure/db/client';

export async function GET() {
  try {
    await sql`SELECT 1`;
    return NextResponse.json({ status: 'ok', db: 'ok' }, { status: 200 });
  } catch {
    return NextResponse.json({ status: 'degraded', db: 'erro' }, { status: 503 });
  }
}
