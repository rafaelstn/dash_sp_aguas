import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';
import { criarClienteSupabaseServer } from '@/infrastructure/auth/supabase-server';
import { validarReturnToInterno } from '@/infrastructure/auth/return-to';

export const dynamic = 'force-dynamic';

/**
 * Encerra a sessão e redireciona pra /login. Aceita GET e POST.
 *
 * Aceita `?returnTo=<path>` para que o login subsequente devolva o usuário
 * ao contexto de origem. Sem isso, técnico que clica "Sair" no app de campo
 * loga de novo e cai no dashboard web (regressão recorrente).
 */
async function sair(request: NextRequest) {
  try {
    const supabase = await criarClienteSupabaseServer();
    await supabase.auth.signOut();
  } catch {
    // Sem auth configurada ou sessão já expirada, segue pro login mesmo assim.
  }
  const returnTo = validarReturnToInterno(
    request.nextUrl.searchParams.get('returnTo'),
  );
  const loginUrl = new URL('/login', request.url);
  if (returnTo) loginUrl.searchParams.set('returnTo', returnTo);
  return NextResponse.redirect(loginUrl);
}

export const GET = sair;
export const POST = sair;
