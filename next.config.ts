import type { NextConfig } from 'next';
import withSerwistInit from '@serwist/next';

/**
 * Configuração do PWA via Serwist.
 *
 * - `swSrc` aponta pro nosso Service Worker custom (em src/app/sw.ts) com
 *   estratégias de cache descritas no ADR-0007 §"Estratégias de cache" e
 *   no checklist do André (`docs/seguranca/checklist-modulo-mobile.md`
 *   §"Hardening do PWA").
 * - `swDest` é onde o build do Serwist gera o SW final em `public/`.
 * - `cacheOnNavigation: false` — não fazemos NavigationRoute precache pra
 *   evitar cache de páginas autenticadas. Páginas /app/* recebem
 *   StaleWhileRevalidate via runtimeCaching dentro do sw.ts.
 * - `disable` em dev — SW só ativo em build de produção (evita os famosos
 *   problemas de stale cache em desenvolvimento).
 * - `register: false` — registramos manualmente no layout do route group
 *   `(mobile)` pra escopar SW só em /app/* (ADR-0007 §2.2).
 * - `scope: '/app/'` — SW só governa rotas do app móvel.
 * - `reloadOnOnline: false` — não fazer auto-reload silencioso (decisão de
 *   segurança: usuário decide quando atualizar; ver InstallPWAPrompt).
 */
const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  // SW desativado em dev por padrão (cache stale atrapalha). Pode ser
  // forçado para testes locais (Lighthouse, manifest debug) com
  // SPAGUAS_PWA_FORCE_ENABLE=1.
  disable:
    process.env.NODE_ENV === 'development' &&
    process.env.SPAGUAS_PWA_FORCE_ENABLE !== '1',
  register: false,
  // Scope precisa ser '/' para cobrir tanto `/app` quanto `/app/...` —
  // o browser não permite escopo "ampliar" via header, e o Lighthouse
  // exige que start_url (`/app` canônico no Next) esteja no scope.
  // As estratégias dentro do sw.ts filtram apenas o que importa:
  // /api/*, /app/*, estáticos. Páginas do dashboard web não recebem
  // estratégia de cache custom, comportamento default do browser.
  scope: '/',
  reloadOnOnline: false,
  // Excluir do precache: rotas de auth, triagem, admin do dashboard, e o
  // próprio worker. Tudo que envolve credencial ou dado sensível NÃO entra
  // no precache (item 8 do hardening do André).
  exclude: [
    /\/api\/auth\//,
    /\/api\/triagem\//,
    /\/login/,
    /\/cadastrar/,
    /\/admin/,
    /\/triagem/,
    /sw\.js$/,
    /workbox-.*\.js$/,
  ],
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Esconde o indicator flutuante do Next.js em dev (canto inferior esquerdo).
  devIndicators: false,
  // O cliente postgres.js roda apenas no servidor; evita bundling acidental no navegador.
  serverExternalPackages: ['postgres'],
  // typedRoutes desabilitado: Turbopack (Next 15.5) ainda não suporta.
  // Reativar quando o Turbopack estabilizar; até lá, o typecheck normal do tsc
  // cobre os href <Link> suficientemente.
  // Cabeçalho de idioma pt-BR é requisito WCAG / e-MAG.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Language', value: 'pt-BR' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      // Hardening específico das rotas /app/* — CSP mais restritivo e
      // Permissions-Policy liberando geolocation só pro app (checklist
      // André §A05 e §"Hardening do PWA").
      {
        source: '/app/:path*',
        headers: [
          {
            key: 'Permissions-Policy',
            value: 'geolocation=(self), camera=(self), microphone=()',
          },
          {
            // CSP mais restritivo no app: sem unsafe-eval. Workers só same-origin.
            // Mantemos 'unsafe-inline' em script-src enquanto não migrarmos os
            // event handlers inline do Next runtime — postergado.
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline'",
              "worker-src 'self'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data:",
              "font-src 'self' data:",
              "connect-src 'self' https://*.supabase.co",
              "manifest-src 'self'",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
        ],
      },
      // Service Worker e manifest precisam de cache curto + content-type
      // correto. Manifest é público (não passa pelo gate de auth).
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/manifest.json',
        headers: [
          { key: 'Content-Type', value: 'application/manifest+json; charset=utf-8' },
          { key: 'Cache-Control', value: 'public, max-age=3600' },
        ],
      },
    ];
  },
};

export default withSerwist(nextConfig);
