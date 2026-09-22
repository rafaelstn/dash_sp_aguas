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
  // Build conteinerizado (Docker/PRODESP). `output: 'standalone'` empacota
  // server.js + node_modules tracados num diretório isolado (.next/standalone),
  // base da imagem on-prem. Condicionado a DOCKER_BUILD pra não alterar em nada
  // o build atual na Vercel (que ignora standalone e usa o próprio adapter).
  // Detalhes: ADR-0015 (conteinerização dual-target Vercel → PRODESP).
  ...(process.env.DOCKER_BUILD === '1' ? { output: 'standalone' as const } : {}),
  // Esconde o indicator flutuante do Next.js em dev (canto inferior esquerdo).
  devIndicators: false,
  // Drivers de banco: rodam APENAS no servidor, e ficam fora do bundle.
  //
  // `postgres` já estava aqui pelo motivo óbvio (evitar bundling acidental no
  // navegador). `mssql` e `tedious` entram por um motivo diferente, e ele foi
  // MEDIDO em 02/09/2026 com dois builds `DOCKER_BUILD=1`, comparando o que
  // sobra em `.next/standalone/node_modules`:
  //
  //   com a declaração:  mssql PRESENTE (25 arquivos), tedious PRESENTE (121)
  //   sem a declaração:  mssql AUSENTE,                tedious AUSENTE
  //
  // E o que torna isto perigoso é o resto da medição: **os dois builds saíram
  // com código 0 e ZERO aviso de webpack.** Não há "Critical dependency", não
  // há "Module not found", não há nada. O container subiria, passaria no
  // healthcheck (que só faz `SELECT 1` no Postgres) e morreria com
  // "Cannot find module 'mssql'" na PRIMEIRA busca de posto, dentro do
  // servidor do órgão, que não tem internet e onde ninguém nosso chega
  // depressa para instalar pacote.
  //
  // Ou seja, sem esta linha o build mente por omissão. Guarda de declaração em
  // `tests/unit/drivers-externos-do-bundle.test.ts`.
  serverExternalPackages: ['postgres', 'mssql', 'tedious'],
  // Otimizador de imagem DESLIGADO. `/_next/image` está fora do matcher de
  // `src/middleware.ts` (e tem de estar: dentro dele todo asset dispararia
  // redirect para /login), então o endpoint respondia sem sessão a qualquer
  // caminho local pedido, e cada resposta passava pelo sharp.
  //
  // Por que desligar, em vez de restringir por `localPatterns`. Medido em
  // 22/09/2026:
  //
  //   1. Ninguém o consome. As três `<Image>` do projeto (login,
  //      ChromeDashboard, MenuMobile) apontam para `/logo-spaguas-header.png` e
  //      TODAS passam `unoptimized`, ou seja, já serviam o arquivo original.
  //      Desligar não muda um pixel na tela.
  //   2. Com esta linha o servidor responde 404 ANTES de validar parâmetro e
  //      antes de carregar o otimizador (`next-server.js`:
  //      `if (imagesConfig.loader !== 'default' || imagesConfig.unoptimized)`).
  //      Com `localPatterns`, o caminho permitido continuaria chegando ao sharp.
  //   3. Com o endpoint fechado, o sharp deixa de ter caminho de execução:
  //      `getSharp()` é preguiçoso e só é chamado de `optimizeImage` e
  //      `canDecodeAvif`, os dois depois do 404. É o que torna seguro excluí-lo
  //      do tracing logo abaixo, e é onde mora a CVE do sharp 0.34.5 levantada
  //      pelo André.
  //
  // O preço: imagem grande acrescentada depois vai íntegra para o navegador,
  // sem redimensionamento no servidor. Com um logo de 178x100 isso não é custo;
  // se um dia for, religar o otimizador exige `localPatterns` na mesma linha E
  // desfazer a exclusão abaixo, e a guarda em
  // `tests/unit/otimizador-de-imagem.test.ts` recusa a porta aberta (as duas
  // ausentes) e cobra a lista quando ele voltar.
  images: { unoptimized: true },
  // O sharp fora da imagem do órgão.
  //
  // MEDIDO, e ao contrário do que eu previa: desligar o otimizador NÃO tira o
  // pacote do `standalone`. O tracing é estático e segue o `require('sharp')`
  // do `image-optimizer.js` do Next, que faz parte do servidor e não olha
  // configuração. Com dois builds `DOCKER_BUILD=1`, `.next/standalone` ficou em
  // 80 MB nos dois casos, com `sharp` e `@img` presentes (20 MB, 25% do total).
  //
  // Excluir é seguro PORQUE o otimizador está desligado logo acima: os únicos
  // chamadores do sharp ficam depois do 404, e `canDecodeAvif` já trata a
  // ausência do pacote em try/catch. Se o otimizador voltar, esta exclusão sai
  // junto, senão a primeira imagem otimizada morre com "Cannot find module".
  //
  // Com a exclusão: `sharp` e `@img` AUSENTES, `.next/standalone` em 60 MB.
  // Provado em EXECUÇÃO, não só em build, e a prova foi feita com a cópia do
  // standalone FORA do repositório, porque rodando de dentro o Node sobe a
  // árvore e ainda acha o `node_modules` do projeto (no container não há nada
  // acima). Nessa cópia, `require('sharp')` dá MODULE_NOT_FOUND, o servidor
  // sobe em 269 ms, `/_next/image?url=...` responde 404 sem estourar e
  // `/logo-spaguas-header.png` continua em 200.
  outputFileTracingExcludes: {
    '*': ['node_modules/sharp/**', 'node_modules/@img/**'],
  },
  // typedRoutes desabilitado: Turbopack (Next 15.5) ainda não suporta.
  // Reativar quando o Turbopack estabilizar; até lá, o typecheck normal do tsc
  // cobre os href <Link> suficientemente.
  // Cabeçalho de idioma pt-BR é requisito WCAG / e-MAG.
  // O Monitor foi fundido na tela Postos (17/09/2026). Link salvo e favorito do
  // navegador continuam chegando: 308 permanente para a tela nova. O Next roda
  // os redirects antes do middleware, então nem a sessão é consultada.
  async redirects() {
    return [{ source: '/monitor', destination: '/', permanent: true }];
  },
  async headers() {
    // Content-Security-Policy NÃO é setada aqui, é montada dinamicamente
    // por request no `src/middleware.ts` com nonce único (substitui o
    // antigo `'unsafe-inline'` em script-src). Este arquivo só serve os
    // headers estáticos restantes (HSTS, COOP, Permissions-Policy, etc).
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
          // HSTS — força HTTPS em todo subdomínio. 2 anos = 63072000s.
          //
          // SEM `preload` deliberadamente (Rodrigo, Sprint 1.S3).
          // Adicionar `; preload` é IRREVERSÍVEL na prática — uma vez que o
          // domínio entra na lista do Chrome (https://hstspreload.org), só sai
          // após meses de processo manual. Pré-requisitos pra ativar:
          //   1. TODOS os subdomínios precisam servir TLS válido.
          //   2. Domínio raiz e www precisam responder em HTTPS.
          //   3. Confirmação com cliente (Governo SP) de que nenhum subdomínio
          //      legado opera em HTTP (ex.: app.dominio.gov.br vs old.dominio.gov.br).
          //
          // Ticket de confirmação aberto em `docs/runbooks/hsts-preload-pendencia.md`.
          // Owner: Paula → Rafael → contato cliente. Ativar `; preload` quando
          // confirmação chegar, seguindo o checklist do runbook.
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains',
          },
          // Content-Security-Policy é setada por request pelo middleware
          // (CSP com nonce). Não defina aqui pra evitar conflito.
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
      // geolocation/camera (PWA precisa). CSP fica por conta do middleware.
      {
        source: '/app/:path*',
        headers: [
          {
            key: 'Permissions-Policy',
            value: 'geolocation=(self), camera=(self), microphone=()',
          },
        ],
      },
      // Hardening específico de /triagem/* (web aprovador). Sem permissões
      // de hardware. CSP vem do middleware (nonce).
      {
        source: '/triagem/:path*',
        headers: [
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
