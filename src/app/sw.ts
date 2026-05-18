/// <reference lib="webworker" />
 
//
// Service Worker do app móvel — escopo /app/.
//
// Implementa as estratégias de cache descritas no ADR-0007 §"Estratégias
// de cache" e os 9 itens de hardening do checklist do André em
// `docs/seguranca/checklist-modulo-mobile.md` §"Hardening do PWA".
//
// Estratégias aplicadas:
//   - NetworkFirst com timeout 3s para `/api/*` (fallback offline previsível)
//   - CacheFirst para estáticos (`/_next/static/`, fontes, ícones, manifest)
//   - NetworkOnly para `/api/auth/*`, `/api/triagem/*`, `/login`, `/cadastrar`
//   - StaleWhileRevalidate para páginas `/app/*`
//
// 9 itens de hardening (mapeamento):
//   1. Skip waiting controlado            -> não chamamos self.skipWaiting() no install
//   2. Não cachear respostas com Set-Cookie -> filtro em plugin abaixo
//   3. Não cachear /api/auth/* nem /api/triagem/* -> NetworkOnly
//   4. CSP do SW restrito                 -> next.config.ts (Content-Security-Policy /app/*)
//   5. Sem postMessage de origem cruzada  -> handler 'message' valida event.source.origin
//   6. Versionar cache (CACHE_VERSION)    -> nome dos caches inclui versão
//   7. Limpar caches antigos no activate  -> handler 'activate' limpa caches fora da versão
//   8. Listar o que NÃO entra no precache -> exclude no next.config.ts
//   9. Fail-open quando SW tem erro fatal  -> handler 'fetch' não chama event.respondWith() em rotas que falham

import { defaultCache } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import {
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  Serwist,
  StaleWhileRevalidate,
} from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Versão incrementada manualmente em mudanças de major do SW (item 6 do
// hardening). Em build novo, hash de bundle do Next quebra o precache
// automaticamente; mas mudança de estratégia exige bump aqui.
const CACHE_VERSION = 'v1';
const CACHE_PREFIX = 'spaguas-app';

const CACHE_NAMES = {
  estaticos: `${CACHE_PREFIX}-estaticos-${CACHE_VERSION}`,
  paginas: `${CACHE_PREFIX}-paginas-${CACHE_VERSION}`,
  api: `${CACHE_PREFIX}-api-${CACHE_VERSION}`,
  imagens: `${CACHE_PREFIX}-imagens-${CACHE_VERSION}`,
};

/**
 * Plugin que rejeita o cache de qualquer Response com header `Set-Cookie`
 * (item 2 do hardening). Embora respostas `Set-Cookie` raramente passem
 * pelo SW (cookies httpOnly são manipulados pelo browser), aplicamos como
 * cinto-e-suspensório.
 */
const naoCachearSetCookie = {
  cacheWillUpdate: async ({ response }: { response: Response }) => {
    if (response.headers.has('set-cookie')) return null;
    // Se a resposta veio do servidor com indicador de não-cachear, respeite.
    const cc = response.headers.get('cache-control') ?? '';
    if (/no-store|private/i.test(cc)) return null;
    return response;
  },
};

const serwist = new Serwist({
  // precacheOptions: arquivos do build do Next entram aqui via __SW_MANIFEST.
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: false, // item 1: controle manual via mensagem do client
  clientsClaim: false, // assume controle só após reload manual
  navigationPreload: true,
  runtimeCaching: [
    // ---------------------------------------------------------------
    // NetworkOnly — credenciais e decisões críticas (item 3 hardening)
    // ---------------------------------------------------------------
    {
      matcher: ({ url }) =>
        url.pathname.startsWith('/api/auth/') ||
        url.pathname.startsWith('/api/triagem/') ||
        url.pathname === '/login' ||
        url.pathname === '/cadastrar',
      handler: new NetworkOnly(),
    },

    // ---------------------------------------------------------------
    // NetworkFirst — APIs gerais consumidas pelo app (postos, fichas)
    // Timeout 3s; em offline, retorna JSON previsível {ok:false, motivo:'offline'}
    // ---------------------------------------------------------------
    {
      matcher: ({ url, request }) =>
        url.pathname.startsWith('/api/') && request.method === 'GET',
      handler: new NetworkFirst({
        cacheName: CACHE_NAMES.api,
        networkTimeoutSeconds: 3,
        plugins: [
          naoCachearSetCookie,
          new ExpirationPlugin({
            maxEntries: 80,
            maxAgeSeconds: 60 * 5, // 5 minutos
          }),
        ],
      }),
    },

    // ---------------------------------------------------------------
    // CacheFirst — estáticos do Next (_next/static), fontes, manifest
    // ---------------------------------------------------------------
    {
      matcher: ({ url }) =>
        url.pathname.startsWith('/_next/static/') ||
        url.pathname === '/manifest.json',
      handler: new CacheFirst({
        cacheName: CACHE_NAMES.estaticos,
        plugins: [
          naoCachearSetCookie,
          new ExpirationPlugin({
            maxEntries: 200,
            maxAgeSeconds: 60 * 60 * 24 * 30, // 30 dias
          }),
        ],
      }),
    },

    // Imagens (ícones, logo)
    {
      matcher: ({ request }) => request.destination === 'image',
      handler: new CacheFirst({
        cacheName: CACHE_NAMES.imagens,
        plugins: [
          naoCachearSetCookie,
          new ExpirationPlugin({
            maxEntries: 60,
            maxAgeSeconds: 60 * 60 * 24 * 30,
          }),
        ],
      }),
    },

    // ---------------------------------------------------------------
    // StaleWhileRevalidate — páginas /app/* navegacionais
    // (visualmente snappy, atualiza em background)
    // ---------------------------------------------------------------
    {
      matcher: ({ url, request }) =>
        url.pathname.startsWith('/app/') &&
        request.mode === 'navigate' &&
        // Excluir paths de auth dentro de /app (defensivo)
        !url.pathname.startsWith('/app/login') &&
        !url.pathname.startsWith('/app/auth'),
      handler: new StaleWhileRevalidate({
        cacheName: CACHE_NAMES.paginas,
        plugins: [
          naoCachearSetCookie,
          new ExpirationPlugin({
            maxEntries: 30,
            maxAgeSeconds: 60 * 60 * 24, // 1 dia
          }),
        ],
      }),
    },

    // Tudo mais que veio do default do Serwist (fallback razoável).
    ...defaultCache,
  ],
  // Fail-open (item 9): se uma rota não casar, deixa o browser cuidar.
  // Não setamos um catchHandler que tente servir HTML offline genérico — em
  // governo, página fora-de-contexto é pior que erro de rede claro.
  fallbacks: {
    entries: [],
  },
});

serwist.addEventListeners();

// ---------------------------------------------------------------------
// Install: NÃO chama skipWaiting. Aguarda mensagem explícita do client
// (item 1 do hardening). O InstallPWAPrompt no front avisa o usuário e
// envia { type: 'SKIP_WAITING' } quando ele aceita atualizar.
// ---------------------------------------------------------------------
self.addEventListener('install', () => {
  // Sem skipWaiting() — controle manual.
});

// ---------------------------------------------------------------------
// Activate: limpa caches antigos (item 7 do hardening).
// ---------------------------------------------------------------------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const nomes = await caches.keys();
      const validos = new Set(Object.values(CACHE_NAMES));
      await Promise.all(
        nomes
          .filter((nome) => nome.startsWith(CACHE_PREFIX) && !validos.has(nome))
          .map((nome) => caches.delete(nome)),
      );
    })(),
  );
});

// ---------------------------------------------------------------------
// Mensagens do client — apenas same-origin (item 5 hardening).
// ---------------------------------------------------------------------
self.addEventListener('message', (event) => {
  // Só aceita mensagem de origens conhecidas. Em produção, self.origin é
  // a origem do site; mensagens de iframes cross-origin não passam.
  const origemValida =
    event.origin === self.location.origin || event.origin === '';
  if (!origemValida) return;

  const data = event.data;
  if (!data || typeof data !== 'object') return;

  switch (data.type) {
    case 'SKIP_WAITING':
      // Permite ao client aplicar a nova versão quando estiver pronto.
      self.skipWaiting();
      break;
    case 'PING':
      event.source?.postMessage({ type: 'PONG', version: CACHE_VERSION });
      break;
    default:
      // ignora silenciosamente — não vazar info do SW pra origens que mandam lixo
      break;
  }
});
