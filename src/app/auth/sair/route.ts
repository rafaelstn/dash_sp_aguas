import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';
import { criarClienteSupabaseServer } from '@/infrastructure/auth/supabase-server';

export const dynamic = 'force-dynamic';

/** Encerra a sessão e redireciona pra /login. Aceita GET e POST. */
async function sair(request: NextRequest) {
  try {
    const supabase = await criarClienteSupabaseServer();
    await supabase.auth.signOut();
  } catch {
    // Sem auth configurada ou sessão já expirada — segue pro login mesmo assim.
  }
  return NextResponse.redirect(new URL('/login', request.url));
}

export const GET = sair;
export const POST = sair;
