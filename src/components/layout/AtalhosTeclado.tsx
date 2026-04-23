'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { DialogAjudaAtalhos } from './DialogAjudaAtalhos';

/**
 * Provider global de atalhos de teclado (estilo Gmail/GitHub).
 * Montado no root layout. Ignora eventos quando o usuário está editando
 * campos (input/textarea/contenteditable).
 *
 * Teclas:
 *   `/`       → foca o campo de busca (role=search input)
 *   `g f`     → /favoritos
 *   `g d`     → /desconformidades
 *   `g h`     → /
 *   `f`       → toggle favorito na ficha atual (se estiver em /postos/<prefixo>)
 *   `Esc`     → limpa filtros ativos (na home)
 *   `?`       → abre modal de ajuda
 */
export function AtalhosTeclado() {
  const router = useRouter();
  const pathname = usePathname();
  const [ajudaAberta, setAjudaAberta] = useState(false);
  const bufferRef = useRef<{ key: string; t: number } | null>(null);

  useEffect(() => {
    function emEdicao(alvo: EventTarget | null): boolean {
      if (!(alvo instanceof HTMLElement)) return false;
      const tag = alvo.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (alvo.isContentEditable) return true;
      return false;
    }

    function focarBusca() {
      const campo = document.querySelector<HTMLInputElement>('form[role="search"] input[type="text"], form[role="search"] input[type="search"], input[name="q"]');
      if (campo) {
        campo.focus();
        campo.select?.();
      }
    }

    function togglefavoritoAtual() {
      const botao = document.querySelector<HTMLButtonElement>(
        'button[aria-pressed][aria-label*="Favoritar"], button[aria-pressed][aria-label*="Remover"]',
      );
      botao?.click();
    }

    function limparFiltros() {
      if (pathname !== '/') return;
      router.push('/');
    }

    function onKey(e: KeyboardEvent) {
      if (emEdicao(e.target)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // `?` normalmente chega como shiftKey + '/'. Aceitamos ambos.
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setAjudaAberta((v) => !v);
        return;
      }

      if (e.key === '/') {
        e.preventDefault();
        focarBusca();
        return;
      }

      if (e.key === 'Escape') {
        limparFiltros();
        return;
      }

      if (e.key === 'f' && pathname.startsWith('/postos/')) {
        e.preventDefault();
        togglefavoritoAtual();
        return;
      }

      if (e.key === 'g') {
        bufferRef.current = { key: 'g', t: Date.now() };
        return;
      }

      if (bufferRef.current?.key === 'g' && Date.now() - bufferRef.current.t < 800) {
        const destino =
          e.key === 'f' ? '/favoritos' :
          e.key === 'd' ? '/desconformidades' :
          e.key === 'h' ? '/' :
          null;
        bufferRef.current = null;
        if (destino) {
          e.preventDefault();
          router.push(destino);
        }
        return;
      }

      bufferRef.current = null;
    }

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [pathname, router]);

  return (
    <DialogAjudaAtalhos aberto={ajudaAberta} aoFechar={() => setAjudaAberta(false)} />
  );
}
