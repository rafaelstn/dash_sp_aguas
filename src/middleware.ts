import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { bypassAuthAtivo } from '@/infrastructure/auth/dev-bypass';
import { acessoSemIdentidadeAtivo } from '@/infrastructure/auth/acesso-sem-identidade';
import { validarReturnToInterno } from '@/infrastructure/auth/return-to';
import { rotaPublica } from '@/domain/auth/rotas-publicas';

/**
 * Gera o cabeçalho Content-Security-Policy desta requisição usando um nonce
 * único por response (substitui o `'unsafe-inline'` antigo em script-src).
 *
 * Em dev precisamos liberar `'unsafe-eval'` para o HMR/refresh do Next 15
 * funcionar; em produção o nonce cobre todos os scripts inline que o Next
 * injeta (o framework lê o header `x-nonce` setado neste middleware e
 * propaga pra tags internas).
 *
 * style-src continua com `'unsafe-inline'` porque Tailwind e o runtime do
 * Next geram estilos inline curtos; nonce em style exigiria refactor das
 * libs e o vetor de ataque (CSS injection) é menor que script.
 */
function montarCsp(nonce: string): string {
  const dev = process.env.NODE_ENV !== 'production';
  const scriptSrc = dev
    ? `'self' 'nonce-${nonce}' 'strict-dynamic' 'unsafe-eval'`
    : `'self' 'nonce-${nonce}' 'strict-dynamic'`;

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
    // Tiles do mapa do Monitor: base OpenStreetMap e a camada WMS oficial de
    // bacias/UGRHIs do DAEE. Sao imagens (sem script), liberadas so estes hosts.
    "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://geodados.daee.sp.gov.br",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}

function gerarNonce(): string {
  // Web Crypto está disponível no Edge runtime do middleware.
  const buffer = new Uint8Array(16);
  crypto.getRandomValues(buffer);
  // Base64 cabe nos limites de header e é aceito por CSP.
  let bin = '';
  for (const b of buffer) bin += String.fromCharCode(b);
  return btoa(bin);
}

/**
 * Devolve novos request headers com o nonce setado em `x-nonce`. O Next 15
 * lê esse header pra propagar nonce nos scripts internos que injeta.
 */
function requestHeadersComNonce(request: NextRequest, nonce: string): Headers {
  const h = new Headers(request.headers);
  h.set('x-nonce', nonce);
  return h;
}

function aplicarCspResponse(response: NextResponse, nonce: string) {
  response.headers.set('x-nonce', nonce);
  response.headers.set('Content-Security-Policy', montarCsp(nonce));
}

/**
 * Bloqueia cache compartilhado (CDN/proxy) em qualquer rota que possa carregar
 * dado de sessão. Aplicado a TUDO que passa pelo middleware, porque o matcher
 * já exclui estáticos. Incidente 2026-05-18, Vistos recentemente da Adayana
 * apareceu pro Rafael, sinal de cache cross-user em camada intermediaria.
 *
 *   private          -> apenas browser do usuário pode cachear
 *   no-store         -> nem o browser deve persistir
 *   must-revalidate  -> sem servir stale sob nenhuma condição
 *   Vary: Cookie     -> cinto e suspensório, qualquer cache que ignore
 *                       no-store ainda assim separa por cookie de sessão
 */
function aplicarNoCacheAutenticado(response: NextResponse) {
  response.headers.set(
    'Cache-Control',
    'private, no-store, no-cache, must-revalidate, max-age=0',
  );
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Vary', 'Cookie');
}

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

export async function middleware(request: NextRequest) {
  const nonce = gerarNonce();
  const requestHeaders = requestHeadersComNonce(request, nonce);

  // Dois modos em que não há sessão para conferir, e o gate de rota sai do
  // caminho. São diferentes e não se confundem:
  //
  //   bypassAuthAtivo()          dev local, preso a NODE_ENV=development
  //                              (infrastructure/auth/dev-bypass.ts).
  //   acessoSemIdentidadeAtivo() PRODUÇÃO no servidor do órgão, que não tem
  //                              internet e portanto não alcança o Supabase,
  //                              enquanto a API de login do órgão não chega
  //                              (infrastructure/auth/acesso-sem-identidade.ts).
  //
  // Nos dois, `/login` desvia para a raiz: a tela existe, continua no
  // repositório e volta a ser o caminho de entrada assim que o modo sair, mas
  // não tem função enquanto não há o que autenticar.
  if (bypassAuthAtivo() || acessoSemIdentidadeAtivo()) {
    if (request.nextUrl.pathname === '/login') {
      const homeUrl = request.nextUrl.clone();
      homeUrl.pathname = '/';
      homeUrl.search = '';
      const redir = NextResponse.redirect(homeUrl);
      aplicarNoCacheAutenticado(redir);
      return redir;
    }
    const resp = NextResponse.next({ request: { headers: requestHeaders } });
    aplicarCspResponse(resp, nonce);
    aplicarNoCacheAutenticado(resp);
    return resp;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Sem as variáveis do Supabase não há como conferir sessão nenhuma. O que
  // acontece a partir daqui depende do ambiente, e a diferença é a fronteira
  // entre conveniência de desenvolvimento e portão aberto em produção.
  //
  // O comentário que estava aqui dizia "Dev local sem Supabase: libera (env.ts
  // bloqueia em produção)" e a segunda metade era falsa: `env.ts` nunca é
  // importado por este arquivo, então nada bloqueava. Como `NEXT_PUBLIC_*` é
  // substituída em tempo de BUILD, uma imagem construída sem os `--build-arg`
  // correspondentes compilava este desvio com `undefined` e servia o sistema
  // inteiro sem autenticação, de dentro da imagem, sem correção possível por
  // variável de ambiente no servidor.
  //
  // Em produção isto passa a ser erro de configuração declarado, e não um
  // portão que se abre em silêncio. Rota pública segue servida para que o
  // healthcheck do container continue respondendo e o diagnóstico seja
  // possível.
  if (!url || !anon) {
    if (process.env.NODE_ENV === 'production' && !rotaPublica(request.nextUrl.pathname)) {
      const recusa = new NextResponse(
        'Configuração de identidade ausente. O sistema não sobe sem autenticação ' +
          'configurada (NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY) ' +
          'nem sem a janela declarada ACESSO_SEM_IDENTIDADE=sim.',
        { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
      );
      aplicarNoCacheAutenticado(recusa);
      return recusa;
    }
    const resp = NextResponse.next({ request: { headers: requestHeaders } });
    aplicarCspResponse(resp, nonce);
    aplicarNoCacheAutenticado(resp);
    return resp;
  }

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request: { headers: requestHeaders } });
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
    const redir = NextResponse.redirect(loginUrl);
    aplicarNoCacheAutenticado(redir);
    return redir;
  }

  // Usuário autenticado tentando acessar /login.
  // Respeita `?returnTo=<path>` se for um path interno seguro (ex.: técnico
  // que volta do /auth/sair preserva o destino /app); caso contrário cai na
  // raiz. Sem isso, quem entra em /login?returnTo=/app já logado ia parar no
  // dashboard web em vez de voltar pro app. (/cadastrar saiu: autocadastro
  // desativado, a própria página redireciona.)
  if (user && request.nextUrl.pathname === '/login') {
    const destino = validarReturnToInterno(
      request.nextUrl.searchParams.get('returnTo'),
    );
    const alvo = request.nextUrl.clone();
    alvo.pathname = destino ?? '/';
    alvo.search = '';
    const redir = NextResponse.redirect(alvo);
    aplicarNoCacheAutenticado(redir);
    return redir;
  }

  aplicarCspResponse(response, nonce);
  aplicarNoCacheAutenticado(response);
  return response;
}

export const config = {
  // Matcher exclui assets estáticos pra não pagar custo de middleware neles
  // E pra não disparar redirect 307 pra /login em arquivos de public/
  // (logo, ícones, fontes, etc.) acessados por usuário não autenticado.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sw.js|manifest.json|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|json|webmanifest|woff|woff2|ttf|otf|eot|map|txt)$).*)',
  ],
};
