import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Middleware de autenticação — gate de todas as rotas exceto as públicas
 * abaixo. Requisito de deploy (ADR-0004): sistema no MVP passa a rodar em
 * Vercel (internet pública), portanto precisa de gate. Implementação isolada
 * em infrastructure/auth/, sem contaminar use cases.
 *
 * Responsabilidades do middleware:
 *   1. Refreshar o token da sessão (obrigatório pelo contrato do @supabase/ssr).
 *   2. Bloquear rotas privadas pra quem não está logado.
 *   3. Quando auth não está configurada (dev local sem Supabase), liberar tudo
 *      para não quebrar o fluxo de desenvolvimento. Em produção, env.ts já
 *      garante que as vars de Supabase existem.
 */

const ROTAS_PUBLICAS = new Set([
  '/login',
  '/auth/callback',
  '/auth/sair',
  '/api/health',
]);

function rotaPublica(pathname: string): boolean {
  if (ROTAS_PUBLICAS.has(pathname)) return true;
  if (pathname.startsWith('/_next/')) return true;
  if (pathname.startsWith('/favicon')) return true;
  if (pathname.startsWith('/robots')) return true;
  return false;
}

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Dev local sem Supabase: libera (env.ts bloqueia em produção).
  if (!url || !anon) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Refresha o token e popula request.cookies — obrigatório.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !rotaPublica(request.nextUrl.pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('returnTo', request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Usuário autenticado tentando acessar /login -> manda pra home.
  if (user && request.nextUrl.pathname === '/login') {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = '/';
    homeUrl.search = '';
    return NextResponse.redirect(homeUrl);
  }

  return response;
}

export const config = {
  // Matcher exclui assets estáticos pra não pagar custo de middleware nelas.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt).*)'],
};
