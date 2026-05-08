'use client';

import { useEffect, useState } from 'react';

/**
 * `BeforeInstallPromptEvent` não é tipado pelo TS por default.
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: ReadonlyArray<string>;
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const STORAGE_KEY_DISPENSADO = 'spaguas:pwa:install-dismissed-em';
const DIAS_RECARENCIA = 14;

/**
 * Prompt de instalação do PWA, ciente da plataforma:
 *  - Android/Chrome/Edge: usa `beforeinstallprompt` nativo.
 *  - iOS Safari: instrui o usuário a usar "Adicionar à Tela de Início"
 *    (Apple não expõe API programática).
 *  - Já instalado: não mostra nada (`display-mode: standalone`).
 *  - Dispensado recentemente: aguarda DIAS_RECARENCIA antes de oferecer de novo.
 *
 * Lazy mount — só monta após o `mounted` estar true e os checks passarem.
 *
 * Acessibilidade: `role="dialog"`, foco gerenciado pelo browser, fechável
 * por botão e ESC (browser nativo).
 */
export function InstallPWAPrompt() {
  const [mounted, setMounted] = useState(false);
  const [eventoNativo, setEventoNativo] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [exibirInstrucaoIos, setExibirInstrucaoIos] = useState(false);

  useEffect(() => {
    setMounted(true);

    // Já instalado? Não mostrar nada.
    const standalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      // iOS legado expõe via navigator.standalone (não-padrão)
      (window.navigator as Navigator & { standalone?: boolean }).standalone ===
        true;
    if (standalone) return;

    // Dispensado recentemente?
    try {
      const dispensadoEm = localStorage.getItem(STORAGE_KEY_DISPENSADO);
      if (dispensadoEm) {
        const ts = Number(dispensadoEm);
        if (
          Number.isFinite(ts) &&
          Date.now() - ts < DIAS_RECARENCIA * 24 * 60 * 60 * 1000
        ) {
          return;
        }
      }
    } catch {
      // localStorage indisponível: segue sem dispensa registrada.
    }

    // iOS: detecta Safari mobile e mostra instrução.
    const ua = window.navigator.userAgent;
    const isIos = /iP(ad|hone|od)/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    if (isIos) {
      // Mostra instrução só após 4s de uso pra não ser ruidoso.
      const timer = setTimeout(() => setExibirInstrucaoIos(true), 4000);
      return () => clearTimeout(timer);
    }

    // Android/Chromium: aguarda o evento `beforeinstallprompt`.
    const handler = (event: Event) => {
      event.preventDefault();
      setEventoNativo(event as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (!mounted) return null;

  function dispensar() {
    try {
      localStorage.setItem(STORAGE_KEY_DISPENSADO, String(Date.now()));
    } catch {
      // sem storage: aceita perda da preferência
    }
    setEventoNativo(null);
    setExibirInstrucaoIos(false);
  }

  async function instalar() {
    if (!eventoNativo) return;
    try {
      await eventoNativo.prompt();
      const { outcome } = await eventoNativo.userChoice;
      if (outcome === 'dismissed') dispensar();
      else setEventoNativo(null);
    } catch {
      dispensar();
    }
  }

  if (eventoNativo) {
    return (
      <div
        role="dialog"
        aria-labelledby="pwa-install-titulo"
        aria-describedby="pwa-install-descricao"
        className="fixed inset-x-3 bottom-20 z-40 rounded-gov-card border border-gov-azul bg-app-surface p-4 shadow-gov-card-hover"
      >
        <p id="pwa-install-titulo" className="text-sm font-semibold text-app-fg">
          Instalar o aplicativo
        </p>
        <p
          id="pwa-install-descricao"
          className="mt-1 text-xs text-app-fg-muted"
        >
          Tenha acesso rápido pelo ícone na tela inicial. Funciona melhor em
          campo e ocupa pouco espaço.
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={instalar}
            className="min-h-[44px] flex-1 rounded bg-gov-azul px-3 text-sm font-semibold text-white hover:bg-gov-azul-escuro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul focus-visible:ring-offset-2"
          >
            Instalar
          </button>
          <button
            type="button"
            onClick={dispensar}
            className="min-h-[44px] rounded border border-app-border px-3 text-sm font-medium text-app-fg hover:bg-app-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul focus-visible:ring-offset-2"
          >
            Agora não
          </button>
        </div>
      </div>
    );
  }

  if (exibirInstrucaoIos) {
    return (
      <div
        role="dialog"
        aria-labelledby="pwa-ios-titulo"
        aria-describedby="pwa-ios-descricao"
        className="fixed inset-x-3 bottom-20 z-40 rounded-gov-card border border-gov-azul bg-app-surface p-4 shadow-gov-card-hover"
      >
        <p id="pwa-ios-titulo" className="text-sm font-semibold text-app-fg">
          Adicionar à tela de início
        </p>
        <p id="pwa-ios-descricao" className="mt-1 text-xs text-app-fg-muted">
          Toque no ícone de compartilhar do Safari e escolha{' '}
          <strong>Adicionar à Tela de Início</strong> para usar como aplicativo.
        </p>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={dispensar}
            className="min-h-[44px] rounded border border-app-border px-3 text-sm font-medium text-app-fg hover:bg-app-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul focus-visible:ring-offset-2"
          >
            Entendi
          </button>
        </div>
      </div>
    );
  }

  return null;
}
