import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';
import { criarClienteSupabaseServer } from '@/infrastructure/auth/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * Callback do magic link. Supabase redireciona pra cá com ?code=...
 * Trocamos o code por sessão (cookies httpOnly) e redirecionamos pra
 * `returnTo` ou raiz.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get('code');
  const returnTo = url.searchParams.get('returnTo') || '/';

  if (!code) {
    return NextResponse.redirect(
      new URL(`/login?erro=link_invalido`, request.url),
    );
  }

  const supabase = await criarClienteSupabaseServer();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(
      new URL(`/login?erro=sessao_recusada`, request.url),
    );
  }

  const destino = returnTo.startsWith('/') ? returnTo : '/';
  return NextResponse.redirect(new URL(destino, request.url));
}
