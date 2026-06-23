'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { LogOut, User } from 'lucide-react';

export interface MenuUsuarioProps {
  nome: string | null;
  email: string;
  /** Destino do logout (preserva returnTo quando aplicável). */
  hrefSair?: string;
  /** Compacto: usado no rodapé da sidenav (sem o nome ao lado do avatar). */
  variante?: 'header' | 'sidenav';
}

/** Deriva até 2 iniciais a partir do nome (ou do e-mail, como fallback). */
function iniciais(nome: string | null, email: string): string {
  const base = (nome && nome.trim()) || email.split('@')[0] || '?';
  const partes = base
    .replace(/[._-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const primeira = partes[0] ?? '';
  if (partes.length === 1) return primeira.slice(0, 2).toUpperCase() || '?';
  const ultima = partes[partes.length - 1] ?? '';
  return ((primeira[0] ?? '') + (ultima[0] ?? '')).toUpperCase() || '?';
}

/**
 * Avatar com iniciais + dropdown de usuário (Perfil, Sair). Acessível:
 * `aria-haspopup`/`aria-expanded`, fecha com Esc e com clique fora, foca o
 * primeiro item ao abrir. Sem dependência de UI externa.
 */
export function MenuUsuario({
  nome,
  email,
  hrefSair = '/auth/sair',
  variante = 'header',
}: MenuUsuarioProps) {
  const [aberto, setAberto] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const primeiroItemRef = useRef<HTMLAnchorElement>(null);
  const menuId = useId();
  const rotulo = nome ?? email;
  const sigla = iniciais(nome, email);

  useEffect(() => {
    if (!aberto) return;
    function aoClicarFora(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setAberto(false);
    }
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') setAberto(false);
    }
    document.addEventListener('mousedown', aoClicarFora);
    document.addEventListener('keydown', aoTeclar);
    // Foca o primeiro item ao abrir.
    requestAnimationFrame(() => primeiroItemRef.current?.focus());
    return () => {
      document.removeEventListener('mousedown', aoClicarFora);
      document.removeEventListener('keydown', aoTeclar);
    };
  }, [aberto]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={menuId}
        className="flex items-center gap-2 rounded-full p-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul focus-visible:ring-offset-2 focus-visible:ring-offset-app-surface"
      >
        <span
          aria-hidden="true"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gov-azul text-2xs font-semibold text-white"
        >
          {sigla}
        </span>
        {variante === 'sidenav' ? (
          <span className="min-w-0 flex-1 text-left">
            <span className="block truncate text-xs font-medium text-app-fg">
              {nome ?? email.split('@')[0]}
            </span>
            <span className="block truncate text-2xs text-app-fg-muted">
              {email}
            </span>
          </span>
        ) : (
          <span className="hidden max-w-[180px] truncate text-xs text-app-fg-muted md:inline">
            {rotulo}
          </span>
        )}
        <span className="sr-only">Abrir menu do usuário</span>
      </button>

      {aberto ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Menu do usuário"
          className={[
            'absolute z-40 mt-2 w-56 overflow-hidden rounded-gov-card border border-app-border-subtle bg-app-surface shadow-gov-card-hover',
            variante === 'sidenav' ? 'bottom-full mb-2 left-0' : 'right-0',
          ].join(' ')}
        >
          <div className="border-b border-app-border-subtle px-3 py-2">
            <p className="truncate text-sm font-medium text-app-fg" title={rotulo}>
              {nome ?? email.split('@')[0]}
            </p>
            <p className="truncate text-2xs text-app-fg-muted" title={email}>
              {email}
            </p>
          </div>
          <Link
            ref={primeiroItemRef}
            role="menuitem"
            href="/perfil"
            onClick={() => setAberto(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-app-fg hover:bg-app-surface-2 focus-visible:bg-app-surface-2 focus-visible:outline-none"
          >
            <User className="h-4 w-4 text-app-fg-muted" aria-hidden="true" />
            Perfil
          </Link>
          <a
            role="menuitem"
            href={hrefSair}
            className="flex items-center gap-2 border-t border-app-border-subtle px-3 py-2 text-sm text-gov-perigo hover:bg-red-50 focus-visible:bg-red-50 focus-visible:outline-none"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sair
          </a>
        </div>
      ) : null}
    </div>
  );
}
