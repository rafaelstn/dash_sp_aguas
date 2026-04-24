'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { DialogAjudaAtalhos } from './DialogAjudaAtalhos';

/**
 * Provider global de atalhos de teclado.
 * Montado no root layout. Todos os atalhos são single-key para máxima
 * ergonomia. Ignora eventos quando o usuário está editando campos
 * (input/textarea/contenteditable) ou usando modificador (Ctrl/Meta/Alt/Shift).
 *
 * Teclas:
 *   `/`   → foca o campo de busca (role=search input)
 *   `p`   → /painel
 *   `f`   → /favoritos   (exceto em /postos/<prefixo>, onde alterna favorito)
 *   `d`   → /desconformidades
 *   `h`   → / (home / busca de postos)
 *   `Esc` → limpa filtros (na home) / fecha diálogo
 *   `?`   → abre/fecha modal de ajuda
 */
export function AtalhosTeclado() {
  const router = useRouter();
  const pathname = usePathname();
  const [ajudaAberta, setAjudaAberta] = useState(false);

  useEffect(() => {
    function emEdicao(alvo: EventTarget | null): boolean {
      if (!(alvo instanceof HTMLElement)) return false;
      const tag = alvo.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (alvo.isContentEditable) return true;
      return false;
    }

    function focarBusca() {
      const campo = document.querySelector<HTMLInputElement>(
        'form[role="search"] input[type="text"], form[role="search"] input[type="search"], input[name="q"]',
      );
      if (campo) {
        campo.focus();
        campo.select?.();
      }
    }

    function toggleFavoritoAtual() {
      const botao = document.querySelector<HTMLButtonElement>(
        'button[aria-pressed][aria-label*="Favoritar"], button[aria-pressed][aria-label*="Remover"]',
      );
      botao?.click();
    }

    function onKey(e: KeyboardEvent) {
      if (emEdicao(e.target)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // `?` normalmente chega como Shift + `/`. Aceitamos ambos antes de
      // bloquear Shift abaixo, senão o atalho de ajuda fica inacessível.
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setAjudaAberta((v) => !v);
        return;
      }

      // Shift + letra não é atalho — evita ativar acidentalmente quando
      // o usuário está tentando digitar uma maiúscula em qualquer lugar.
      if (e.shiftKey) return;

      switch (e.key) {
        case '/':
          e.preventDefault();
          focarBusca();
          return;
        case 'Escape':
          // Limpar filtros só faz sentido na home.
          if (pathname === '/') router.push('/');
          return;
        case 'p':
          e.preventDefault();
          router.push('/painel');
          return;
        case 'd':
          e.preventDefault();
          router.push('/desconformidades');
          return;
        case 'h':
          e.preventDefault();
          router.push('/');
          return;
        case 'f':
          e.preventDefault();
          // Na ficha de posto, `f` alterna o favorito do posto aberto;
          // em qualquer outra tela, navega para a lista de favoritos.
          if (pathname.startsWith('/postos/')) {
            toggleFavoritoAtual();
          } else {
            router.push('/favoritos');
          }
          return;
      }
    }

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pathname, router]);

  return (
    <DialogAjudaAtalhos aberto={ajudaAberta} aoFechar={() => setAjudaAberta(false)} />
  );
}
