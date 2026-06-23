'use client';

import { useEffect, useId, useRef, useState } from 'react';

export type VarianteConfirm = 'normal' | 'perigo';

export interface ConfirmDialogProps {
  /** Controla a abertura do modal. */
  aberto: boolean;
  titulo: string;
  /** Corpo descritivo. Aceita texto ou nós (ex. <strong>, listas). */
  descricao: React.ReactNode;
  /** Rótulo do botão de confirmação. Padrão: "Confirmar". */
  rotuloConfirmar?: string;
  /** Rótulo do botão de cancelamento. Padrão: "Cancelar". */
  rotuloCancelar?: string;
  /** `perigo` pinta o botão de confirmação com a cor de risco. */
  variante?: VarianteConfirm;
  /**
   * Ação executada ao confirmar. Pode ser assíncrona — enquanto a Promise
   * não resolve, os botões ficam travados e o de confirmar mostra loading.
   * Se rejeitar, a mensagem cai no estado de erro e o modal permanece aberto.
   */
  aoConfirmar: () => void | Promise<void>;
  /** Fecha o modal (cancelar, Esc, clique no backdrop). */
  aoCancelar: () => void;
}

/**
 * Modal de confirmação genérico, baseado no `<dialog>` nativo do HTML
 * (focus-trap e modalidade vêm de graça via `showModal()`). Extraído do
 * padrão do DialogConfirmarDecisao para reuso em qualquer ação destrutiva
 * ou que exija dupla confirmação, eliminando os `window.confirm()` nativos.
 *
 * A11y: `aria-labelledby`/`aria-describedby`, foco inicial no botão de
 * confirmação, Esc/backdrop fecham (a menos que esteja processando), e
 * erro com `role="alert"`.
 */
export function ConfirmDialog({
  aberto,
  titulo,
  descricao,
  rotuloConfirmar = 'Confirmar',
  rotuloCancelar = 'Cancelar',
  variante = 'normal',
  aoConfirmar,
  aoCancelar,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const baseId = useId();
  const tituloId = `${baseId}-titulo`;
  const descId = `${baseId}-desc`;
  const erroId = `${baseId}-erro`;

  // Abre/fecha o <dialog> imperativamente: `open=` declarativo e o modo
  // modal não convivem; showModal() é o caminho recomendado pelo HTML.
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (aberto && !dlg.open) {
      dlg.showModal();
      // Foca o botão de confirmar (data-acao) ao abrir.
      requestAnimationFrame(() => {
        dlg
          .querySelector<HTMLButtonElement>('button[data-acao="confirmar"]')
          ?.focus();
      });
    } else if (!aberto && dlg.open) {
      dlg.close();
    }
  }, [aberto]);

  // Reset de estado a cada nova abertura.
  useEffect(() => {
    if (aberto) {
      setProcessando(false);
      setErro(null);
    }
  }, [aberto]);

  function cancelar() {
    if (processando) return;
    aoCancelar();
  }

  async function confirmar() {
    if (processando) return;
    setProcessando(true);
    setErro(null);
    try {
      await aoConfirmar();
      // Sucesso: quem controla `aberto` fecha o modal.
    } catch (e) {
      setErro(
        e instanceof Error && e.message
          ? e.message
          : 'Não foi possível concluir a operação. Tente novamente em instantes.',
      );
      setProcessando(false);
    }
  }

  const classeConfirmar =
    variante === 'perigo'
      ? 'bg-gov-perigo text-white hover:bg-red-900 focus-visible:outline-gov-perigo'
      : 'bg-gov-azul text-white hover:bg-gov-azul-escuro focus-visible:outline-gov-azul';

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        // Esc fecha o <dialog> nativo — interceptamos para sincronizar o
        // estado React e bloquear o fechamento durante o processamento.
        if (processando) {
          e.preventDefault();
          return;
        }
        aoCancelar();
      }}
      onClose={() => {
        if (aberto) aoCancelar();
      }}
      aria-labelledby={tituloId}
      aria-describedby={descId}
      className="m-0 max-w-md rounded-gov-card border border-app-border-subtle bg-app-surface p-0 text-app-fg shadow-gov-card-hover backdrop:bg-black/40 sm:m-auto"
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          void confirmar();
        }}
        className="flex flex-col"
      >
        <header className="border-b border-app-border-subtle px-5 py-3">
          <h2 id={tituloId} className="text-lg font-semibold">
            {titulo}
          </h2>
        </header>

        <div className="space-y-3 px-5 py-4">
          <div id={descId} className="text-sm text-app-fg">
            {descricao}
          </div>

          {erro ? (
            <div
              id={erroId}
              role="alert"
              className="rounded border-l-4 border-gov-perigo bg-red-50 p-3 text-sm text-gov-perigo"
            >
              {erro}
            </div>
          ) : null}
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-app-border-subtle bg-app-surface-2 px-5 py-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={cancelar}
            disabled={processando}
            className="rounded border border-app-border-subtle bg-app-surface px-3 py-1.5 text-sm font-medium text-app-fg hover:bg-app-surface-2 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
          >
            {rotuloCancelar}
          </button>
          <button
            type="submit"
            data-acao="confirmar"
            disabled={processando}
            aria-describedby={erro ? erroId : undefined}
            className={[
              'rounded px-3 py-1.5 text-sm font-medium disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
              classeConfirmar,
            ].join(' ')}
          >
            {processando ? 'Processando…' : rotuloConfirmar}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
