'use client';

import { useEffect, useRef } from 'react';

const ATALHOS: Array<{ tecla: string; acao: string }> = [
  { tecla: '/', acao: 'Focar o campo de busca' },
  { tecla: 'P', acao: 'Ir para Painel' },
  { tecla: 'F', acao: 'Ir para Favoritos (ou alternar favorito na ficha)' },
  { tecla: 'D', acao: 'Ir para Desconformidades' },
  { tecla: 'H', acao: 'Ir para Home (busca de postos)' },
  { tecla: 'Esc', acao: 'Limpar filtros (na home)' },
  { tecla: '?', acao: 'Abrir/fechar esta ajuda' },
];

export interface DialogAjudaAtalhosProps {
  aberto: boolean;
  aoFechar: () => void;
}

export function DialogAjudaAtalhos({ aberto, aoFechar }: DialogAjudaAtalhosProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const alvoAnterior = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();

    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        aoFechar();
      }
    }
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('keydown', onEsc);
      alvoAnterior?.focus?.();
    };
  }, [aberto, aoFechar]);

  if (!aberto) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-ajuda-atalhos"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      {/* Backdrop: botão invisível pra fechar ao clicar fora. Acessível via Esc. */}
      <button
        type="button"
        aria-label="Fechar ajuda"
        tabIndex={-1}
        onClick={aoFechar}
        className="absolute inset-0 w-full h-full cursor-default focus:outline-none"
      />
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="relative max-w-md w-full bg-white rounded-gov-card shadow-gov-card-hover border border-gov-borda p-5 focus:outline-none"
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <h2 id="titulo-ajuda-atalhos" className="text-lg font-semibold text-gov-texto">
            Atalhos de teclado
          </h2>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar ajuda"
            className="text-gov-muted hover:text-gov-texto text-xl leading-none"
          >
            ×
          </button>
        </div>
        <dl className="divide-y divide-gov-borda text-sm">
          {ATALHOS.map((a) => (
            <div key={a.tecla} className="flex items-center justify-between gap-4 py-2">
              <dt className="text-gov-muted">{a.acao}</dt>
              <dd>
                <kbd className="font-mono text-xs bg-gov-superficie-2 border border-gov-borda rounded px-2 py-1 text-gov-texto">
                  {a.tecla}
                </kbd>
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs text-gov-muted">
          Atalhos são ignorados quando você está digitando em um campo.
        </p>
      </div>
    </div>
  );
}
