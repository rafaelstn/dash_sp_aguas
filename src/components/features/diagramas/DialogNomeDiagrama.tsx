'use client';

import { useEffect, useId, useRef, useState } from 'react';

export interface DialogNomeDiagramaProps {
  aberto: boolean;
  titulo: string;
  rotuloConfirmar: string;
  nomeInicial: string;
  /** Recebe o nome já com trim. Pode ser assíncrono; trava os botões. */
  aoConfirmar: (nome: string) => void | Promise<void>;
  aoCancelar: () => void;
}

const MAX = 200;

/**
 * Dialog de entrada de nome (criar/renomear diagrama), no padrão do
 * ConfirmDialog: <dialog> nativo (focus-trap e modalidade via showModal()),
 * a11y com aria-labelledby, foco inicial no campo, Esc/backdrop fecham.
 * Substitui o window.prompt nativo proibido pelo padrão do projeto.
 */
export function DialogNomeDiagrama({
  aberto,
  titulo,
  rotuloConfirmar,
  nomeInicial,
  aoConfirmar,
  aoCancelar,
}: DialogNomeDiagramaProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [nome, setNome] = useState(nomeInicial);
  const [processando, setProcessando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const baseId = useId();
  const tituloId = `${baseId}-titulo`;
  const campoId = `${baseId}-campo`;
  const erroId = `${baseId}-erro`;

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (aberto && !dlg.open) {
      dlg.showModal();
      requestAnimationFrame(() => inputRef.current?.focus());
    } else if (!aberto && dlg.open) {
      dlg.close();
    }
  }, [aberto]);

  // Reseta estado e campo a cada abertura.
  useEffect(() => {
    if (aberto) {
      setNome(nomeInicial);
      setProcessando(false);
      setErro(null);
    }
  }, [aberto, nomeInicial]);

  function cancelar() {
    if (processando) return;
    aoCancelar();
  }

  async function confirmar() {
    if (processando) return;
    const limpo = nome.trim();
    if (!limpo) {
      setErro('Informe um nome.');
      inputRef.current?.focus();
      return;
    }
    setProcessando(true);
    setErro(null);
    try {
      await aoConfirmar(limpo);
    } catch (e) {
      setErro(
        e instanceof Error && e.message
          ? e.message
          : 'Não foi possível concluir a operação. Tente novamente em instantes.',
      );
      setProcessando(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
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
      className="m-0 max-w-md rounded-gov-card border border-app-border-subtle bg-app-surface p-0 text-app-fg shadow-gov-card-hover backdrop:bg-black/40 sm:m-auto"
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          void confirmar();
        }}
        className="flex w-[min(90vw,28rem)] flex-col"
      >
        <header className="border-b border-app-border-subtle px-5 py-3">
          <h2 id={tituloId} className="text-lg font-semibold">
            {titulo}
          </h2>
        </header>

        <div className="space-y-3 px-5 py-4">
          <label htmlFor={campoId} className="block text-sm font-medium text-app-fg">
            Nome do diagrama
          </label>
          <input
            ref={inputRef}
            id={campoId}
            type="text"
            value={nome}
            maxLength={MAX}
            onChange={(e) => setNome(e.target.value)}
            disabled={processando}
            aria-invalid={erro ? true : undefined}
            aria-describedby={erro ? erroId : undefined}
            className="w-full rounded border border-app-border-subtle bg-app-surface px-3 py-1.5 text-sm text-app-fg placeholder:text-app-fg-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
            placeholder="Ex.: Rede Alto Tietê"
          />

          {erro ? (
            <p id={erroId} role="alert" className="text-sm text-gov-perigo">
              {erro}
            </p>
          ) : null}
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-app-border-subtle bg-app-surface-2 px-5 py-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={cancelar}
            disabled={processando}
            className="rounded border border-app-border-subtle bg-app-surface px-3 py-1.5 text-sm font-medium text-app-fg hover:bg-app-surface-2 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={processando}
            className="rounded bg-gov-azul px-3 py-1.5 text-sm font-medium text-white hover:bg-gov-azul-escuro disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
          >
            {processando ? 'Processando…' : rotuloConfirmar}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
