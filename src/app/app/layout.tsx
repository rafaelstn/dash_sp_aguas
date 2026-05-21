import type { Metadata, Viewport } from 'next';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import { BottomNav } from '@/components/mobile/BottomNav';
import { RegistrarServiceWorker } from '@/components/mobile/RegistrarServiceWorker';
import { InstallPWAPrompt } from '@/components/mobile/InstallPWAPrompt';
import { VoltarAndroid } from '@/components/mobile/VoltarAndroid';

/**
 * Layout do app móvel (rotas /app/*). Diferente do layout `(dashboard)`,
 * este NÃO inclui sidenav nem chrome de página web — é desenhado
 * mobile-first para ser instalado como PWA.
 *
 * Decisões:
 *  - viewport: maximum-scale=1 para evitar zoom acidental que afeta
 *    formulários (preserva acessibilidade via `userScalable: true` —
 *    usuário pode dar pinch-zoom mesmo assim).
 *  - theme-color = gov-azul (#1E40AF), bate com manifest e dá visual
 *    institucional na status bar Android.
 *  - registra o Service Worker apenas dentro deste layout (escopo /app/).
 *  - `<main>` com landmark explícito (a11y / e-MAG).
 *
 * Importante: páginas filhas devem prover seu próprio Header (via
 * `<HeaderMobile>`) — manter cada página responsável pelo título evita
 * passes de prop pelo layout.
 */

export const metadata: Metadata = {
  title: {
    default: 'SPÁguas — Ficha Técnica de Campo',
    template: '%s · SPÁguas',
  },
  description:
    'Aplicativo do técnico de campo para preencher fichas de inspeção, manutenção e medição dos postos hidrológicos da rede SPÁguas.',
  manifest: '/manifest.json',
  applicationName: 'SPÁguas — Ficha Técnica',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'SPÁguas',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // maximumScale removido: bloqueava o zoom (a11y / WCAG 1.4.4 — Resize text).
  // Permitir zoom é exigência e-MAG / governo.
  userScalable: true,
  themeColor: '#1E40AF',
  colorScheme: 'light',
  viewportFit: 'cover',
};

export default async function MobileAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Embora o middleware já force login pra rotas privadas, lê o usuário
  // aqui para repassar pros componentes filhos via header próprio. Se
  // por algum motivo não houver sessão (ex.: bypass dev), o layout não
  // quebra.
  const usuario = await obterUsuarioAtual();

  return (
    <div
      className="flex min-h-screen flex-col bg-app-bg text-app-fg"
      data-app-mobile="true"
      data-usuario={usuario?.id ?? 'anon'}
    >
      {/*
        Registro early do Service Worker via inline script. Roda antes da
        hidratação do React, o que garante que o Lighthouse detecte o SW
        controlando `start_url` no momento do audit. O componente
        `RegistrarServiceWorker` continua respondendo aos eventos de
        update (mantido por compatibilidade futura).
      */}
      <script
         
        dangerouslySetInnerHTML={{
          __html: `
            if ('serviceWorker' in navigator &&
                (location.protocol === 'https:' ||
                 location.hostname === 'localhost' ||
                 location.hostname === '127.0.0.1')) {
              navigator.serviceWorker.register('/sw.js', {
                scope: '/',
                updateViaCache: 'none'
              }).catch(function(){ /* fail-open */ });
            }
          `.replace(/\s+/g, ' '),
        }}
      />
      <RegistrarServiceWorker />
      <VoltarAndroid />

      {/* Conteúdo principal — cada page renderiza seu próprio header */}
      <main
        id="conteudo-principal"
        role="main"
        aria-label="Conteúdo do aplicativo SPÁguas"
        className="flex-1"
      >
        {children}
      </main>

      <BottomNav />
      <InstallPWAPrompt />
    </div>
  );
}
