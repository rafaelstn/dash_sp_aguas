'use client';

import { useEffect } from 'react';

/**
 * Trata o botão "voltar" físico do Android quando o app roda dentro do APK
 * (Capacitor). Sem isso, o WebView ignora o histórico e o botão fecha o app
 * na hora. Aqui: se há para onde voltar, navega; se já está na raiz do app,
 * minimiza (vai pro background) em vez de fechar abruptamente.
 *
 * Inerte fora do Capacitor (navegador comum): o import é dinâmico e o
 * listener `backButton` simplesmente não dispara na web.
 */
export function VoltarAndroid() {
  useEffect(() => {
    let remover: (() => void) | undefined;

    (async () => {
      try {
        const { App } = await import('@capacitor/app');
        const handle = await App.addListener('backButton', ({ canGoBack }) => {
          if (canGoBack || window.history.length > 1) {
            window.history.back();
          } else {
            void App.minimizeApp();
          }
        });
        remover = () => {
          void handle.remove();
        };
      } catch {
        // Fora do Capacitor ou plugin indisponível: ignora.
      }
    })();

    return () => remover?.();
  }, []);

  return null;
}
