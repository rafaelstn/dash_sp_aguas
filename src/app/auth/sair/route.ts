import 'server-only';

import { NextResponse, type NextRequest } from 'next/server';
import { criarClienteSupabaseServer } from '@/infrastructure/auth/supabase-server';
import { validarReturnToInterno } from '@/infrastructure/auth/return-to';
import { acessoSemIdentidadeAtivo } from '@/infrastructure/auth/acesso-sem-identidade';

export const dynamic = 'force-dynamic';

/**
 * Encerra a sessão e redireciona pra /login. Aceita GET e POST.
 *
 * Exceção: com ACESSO_SEM_IDENTIDADE=sim não existe sessão, e o destino é a
 * raiz. Ver o corpo da função.
 *
 * Aceita `?returnTo=<path>` para que o login subsequente devolva o usuário
 * ao contexto de origem. Sem isso, técnico que clica "Sair" no app de campo
 * loga de novo e cai no dashboard web (regressão recorrente).
 */
async function sair(request: NextRequest) {
  // Janela sem identidade: não há sessão para encerrar, e mandar para /login
  // produziria um laço, porque o middleware desvia /login de volta para a raiz.
  // O caminho continua existindo, e não some do repositório, porque endereço
  // guardado não expira: PWA já instalado carrega o link antigo no cache do
  // service worker, e favorito de navegador dura mais que qualquer refatoração.
  if (acessoSemIdentidadeAtivo()) {
    return NextResponse.redirect(new URL('/', request.url));
  }

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
