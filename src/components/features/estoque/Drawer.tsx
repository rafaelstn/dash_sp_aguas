'use client';

import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

interface DrawerProps {
  aberto: boolean;
  titulo: string;
  subtitulo?: string;
  /** Acoes no topo (botoes de gestao). Ficam antes do fechar. */
  acoes?: React.ReactNode;
  aoFechar: () => void;
  children: React.ReactNode;
}

/**
 * Painel lateral (drawer) em `<dialog>` nativo: `showModal()` entrega
 * focus-trap, modalidade e Esc de graca, mesmo padrao do ConfirmDialog e do
 * PainelDetalheEstacao. No mobile ocupa a tela inteira; no desktop desliza da
 * direita. A11y: aria-labelledby, foco inicial no fechar, region rolavel.
 */
export function Drawer({ aberto, titulo, subtitulo, acoes, aoFechar, children }: DrawerProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const baseId = useId();
  const tituloId = `${baseId}-titulo`;

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (aberto && !dlg.open) {
      dlg.showModal();
      requestAnimationFrame(() => {
        dlg.querySelector<HTMLButtonElement>('button[data-fechar]')?.focus();
      });
    } else if (!aberto && dlg.open) {
      dlg.close();
    }
  }, [aberto]);

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        e.preventDefault();
        aoFechar();
      }}
      onClose={() => {
        if (aberto) aoFechar();
      }}
      aria-modal="true"
      aria-labelledby={tituloId}
      className="m-0 ml-auto h-full max-h-none w-full max-w-none border-0 bg-transparent p-0 backdrop:bg-black/40 sm:h-screen sm:w-[38rem]"
    >
      <div className="flex h-full flex-col bg-app-surface text-app-fg shadow-gov-card-hover">
        <header className="flex items-start gap-3 border-b border-app-border-subtle px-5 py-3">
          <div className="min-w-0 flex-1">
            <h2 id={tituloId} className="truncate text-lg font-semibold text-app-fg">
              {titulo}
            </h2>
            {subtitulo ? (
              <p className="mt-0.5 truncate text-xs text-app-fg-muted">{subtitulo}</p>
            ) : null}
          </div>
          {acoes ? <div className="flex flex-wrap items-center gap-2">{acoes}</div> : null}
          <button
            type="button"
            data-fechar
            onClick={aoFechar}
            aria-label="Fechar painel"
            className="shrink-0 rounded p-1.5 text-app-fg-muted hover:bg-app-surface-2 hover:text-app-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </dialog>
  );
}
