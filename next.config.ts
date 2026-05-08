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
    // CSP base — aplicada GLOBALMENTE. Restritiva por padrão, sem `unsafe-eval`.
    // Mantém `'unsafe-inline'` em script-src (Next.js runtime injeta scripts
    // inline; migrar pra CSP nonce-based exige refactor de _document e está
    // postergado pra fase de hardening pós-MVP).
    const cspBase = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "worker-src 'self' blob:",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.supabase.co",
      "manifest-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      // Sem object-src = recusa <object>/<embed> — defesa contra Flash legacy.
      "object-src 'none'",
    ].join('; ');

    // CSP do `/triagem/*` (web aprovador) — mesma base; futuramente pode
    // remover `'unsafe-inline'` quando o time migrar pra nonce-based.
    const cspTriagem = cspBase;

    return [
      {
        source: '/:path*',
        headers: [
          // Headers globais — toda resposta carrega.
          { key: 'Content-Language', value: 'pt-BR' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Defense-in-depth contra clickjacking (CSP frame-ancestors também
          // cobre browsers modernos; X-Frame-Options ainda existe pra IE/Edge
          // legacy que não respeitam frame-ancestors).
          { key: 'X-Frame-Options', value: 'DENY' },
          // HSTS — força HTTPS em todo subdomínio, com preload eligible.
          // 2 anos = 63072000 segundos. includeSubDomains exige TODOS os
          // subdomínios servidos via TLS — confirmar com Rodrigo antes de
          // adicionar `preload`.
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains',
          },
          // CSP base aplicada a tudo, exceto onde sobrescrita abaixo.
          { key: 'Content-Security-Policy', value: cspBase },
          // Permissions-Policy default: nada liberado. Sobrescrito em /app/*.
          {
            key: 'Permissions-Policy',
            value:
              'geolocation=(), camera=(), microphone=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()',
          },
          // Cross-Origin policies — defesa contra Spectre-style cross-origin
          // leaks. Mantém compat com nosso uso (sem iframes externos).
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
        ],
      },
      // Hardening específico das rotas /app/* — Permissions-Policy libera
      // geolocation/camera (PWA precisa), CSP herdada do global mas com
      // worker-src restrito ao mesmo origin.
      {
        source: '/app/:path*',
        headers: [
          {
            key: 'Permissions-Policy',
            value: 'geolocation=(self), camera=(self), microphone=()',
          },
          {
            // CSP idêntica à base — `worker-src 'self' blob:` permite o SW.
            key: 'Content-Security-Policy',
            value: cspBase,
          },
        ],
      },
      // Hardening específico de /triagem/* (web aprovador). Mantém HSTS +
      // CSP. Sem permissões de hardware. Reforça frame-ancestors none.
      {
        source: '/triagem/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: cspTriagem },
          {
            key: 'Permissions-Policy',
            value: 'geolocation=(), camera=(), microphone=()',
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
