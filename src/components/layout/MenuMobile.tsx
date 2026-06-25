'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { ItemSidenav } from './ItemSidenav';
import type { ItemNav } from './nav-itens';

interface Props {
  itens: ItemNav[];
}

/**
 * Botão hamburger + drawer com a mesma lista do Sidenav, exibido em
 * mobile/tablet (< lg). Resolve o problema reportado na auditoria:
 * sem esse componente, gestor no celular ficava preso na home porque
 * o Sidenav é `hidden lg:flex`.
 *
 * Usa <dialog> HTML5 nativo para ganhar focus trap, ESC pra fechar
 * e gestão de foco automática.
 */
export function MenuMobile({ itens }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [aberto, setAberto] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberto && !d.open) d.showModal();
    else if (!aberto && d.open) d.close();
  }, [aberto]);

  // Fecha o drawer ao navegar (evita ficar aberto após o usuário clicar
  // em um link, já que o pathname muda mas o componente não desmonta).
  useEffect(() => {
    setAberto(false);
  }, [pathname]);

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-label="Abrir menu de navegação"
        aria-expanded={aberto}
        aria-controls="menu-mobile-dialog"
        className="rounded p-1.5 text-app-fg hover:bg-app-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul lg:hidden"
      >
        <Menu aria-hidden="true" className="h-5 w-5" />
      </button>

      {/* ESC e click no backdrop fecham. <dialog> nativo é interativo por
          especificação, mas jsx-a11y o classifica como "non-interactive"
          e dispara falsos positivos em onClick. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events */}
      <dialog
        id="menu-mobile-dialog"
        ref={ref}
        aria-modal="true"
        aria-labelledby="menu-mobile-titulo"
        onClose={() => setAberto(false)}
        onClick={(e) => {
          if (e.target === ref.current) setAberto(false);
        }}
        className="m-0 ml-0 h-screen max-h-screen w-72 max-w-[85vw] rounded-none border-r border-app-border-subtle bg-app-surface p-0 text-app-fg shadow-gov-card-hover backdrop:bg-black/40"
      >
        <div className="flex h-full flex-col">
          <header className="flex items-center justify-between border-b border-app-border-subtle px-3 py-2">
            <h2 id="menu-mobile-titulo" className="text-xs font-semibold uppercase tracking-wider text-app-fg-muted">
              Navegação
            </h2>
            <button
              type="button"
              onClick={() => setAberto(false)}
              aria-label="Fechar menu"
              className="rounded p-1 text-app-fg hover:bg-app-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </header>
          <nav className="flex-1 overflow-y-auto p-2">
            <ul className="space-y-0.5">
              {itens.map((item) => (
                <li key={item.href}>
                  <ItemSidenav
                    href={item.href}
                    rotulo={item.rotulo}
                    icone={item.icone}
                    contador={item.contador}
                  />
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </dialog>
    </>
  );
}
