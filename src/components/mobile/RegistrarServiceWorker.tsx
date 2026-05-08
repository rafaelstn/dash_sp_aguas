'use client';

import { useEffect } from 'react';

/**
 * Escuta atualizações de SW. O REGISTRO em si é feito por inline script no
 * `layout.tsx` (early, antes da hidratação) — necessário para que o
 * Lighthouse detecte o SW controlando `start_url` no audit.
 *
 * Aqui ouvimos `updatefound`/`statechange` para emitir um custom event
 * `spaguas:sw-update-disponivel` que pode ser usado por um banner de
 * "nova versão disponível" no futuro. NÃO chamamos `skipWaiting()`
 * automaticamente (item 1 do hardening do checklist do André).
 */
export function RegistrarServiceWorker() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    let cancelado = false;

    navigator.serviceWorker.ready
      .then((registration) => {
        if (cancelado) return;

        const handleUpdateFound = () => {
          const novo = registration.installing;
          if (!novo) return;
          novo.addEventListener('statechange', () => {
            if (
              novo.state === 'installed' &&
              navigator.serviceWorker.controller
            ) {
              window.dispatchEvent(
                new CustomEvent('spaguas:sw-update-disponivel'),
              );
            }
          });
        };

        registration.addEventListener('updatefound', handleUpdateFound);
      })
      .catch(() => {
        // Fail-open (item 9 do hardening): erros silenciosos.
      });

    return () => {
      cancelado = true;
    };
  }, []);

  return null;
}
