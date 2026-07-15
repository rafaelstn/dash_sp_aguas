'use client';

import { useEffect, useId, useRef, useState } from 'react';

interface FormDialogProps {
  aberto: boolean;
  titulo: string;
  rotuloConfirmar?: string;
  /** Executa o envio. Deve lancar Error (mensagem) em caso de falha. */
  aoSalvar: () => Promise<void>;
  aoFechar: () => void;
  children: React.ReactNode;
}

/**
 * Shell de formulario em `<dialog>` modal, reutilizado pelos CRUDs do estoque
 * (material, unidade, local, categoria). Trava os botoes durante o envio, exibe
 * erro com role=alert e nunca usa dialog nativo do navegador. A11y: foco
 * inicial no primeiro campo, Esc/cancelar fecham quando ocioso.
 */
export function FormDialog({
  aberto,
  titulo,
  rotuloConfirmar = 'Salvar',
  aoSalvar,
  aoFechar,
  children,
}: FormDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const baseId = useId();

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (aberto && !dlg.open) {
      dlg.showModal();
      requestAnimationFrame(() => {
        dlg
          .querySelector<HTMLElement>('input, select, textarea')
          ?.focus();
      });
    } else if (!aberto && dlg.open) {
      dlg.close();
    }
  }, [aberto]);

  useEffect(() => {
    if (aberto) {
      setSalvando(false);
      setErro(null);
    }
  }, [aberto]);

  async function submeter() {
    if (salvando) return;
    setSalvando(true);
    setErro(null);
    try {
      await aoSalvar();
    } catch (e) {
      setErro(
        e instanceof Error && e.message
          ? e.message
          : 'Não foi possível salvar. Tente novamente em instantes.',
      );
      setSalvando(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        if (salvando) {
          e.preventDefault();
          return;
        }
        aoFechar();
      }}
      onClose={() => {
        if (aberto) aoFechar();
      }}
      aria-modal="true"
      aria-labelledby={`${baseId}-titulo`}
      className="m-0 w-full max-w-lg rounded-gov-card border border-app-border-subtle bg-app-surface p-0 text-app-fg shadow-gov-card-hover backdrop:bg-black/40 sm:m-auto"
    >
      <form
        method="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          void submeter();
        }}
        className="flex max-h-[85vh] flex-col"
      >
        <header className="border-b border-app-border-subtle px-5 py-3">
          <h2 id={`${baseId}-titulo`} className="text-lg font-semibold">
            {titulo}
          </h2>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {children}
          {erro ? (
            <div
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
            onClick={aoFechar}
            disabled={salvando}
            className="rounded border border-app-border-subtle bg-app-surface px-3 py-1.5 text-sm font-medium text-app-fg hover:bg-app-surface-2 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={salvando}
            className="rounded bg-gov-azul px-3 py-1.5 text-sm font-medium text-white hover:bg-gov-azul-escuro disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
          >
            {salvando ? 'Salvando…' : rotuloConfirmar}
          </button>
        </footer>
      </form>
    </dialog>
  );
}

// ── Campos reutilizaveis dos formularios ─────────────────────────────────────

export function CampoTextoForm({
  rotulo,
  valor,
  aoMudar,
  obrigatorio,
  placeholder,
  descricao,
}: {
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
  obrigatorio?: boolean;
  placeholder?: string;
  descricao?: string;
}) {
  const id = useId();
  const descId = descricao ? `${id}-desc` : undefined;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-app-fg">
        {rotulo}
        {obrigatorio ? <span className="text-gov-perigo"> *</span> : null}
      </label>
      {descricao ? (
        <span id={descId} className="text-2xs text-app-fg-muted">
          {descricao}
        </span>
      ) : null}
      <input
        id={id}
        type="text"
        value={valor}
        required={obrigatorio}
        placeholder={placeholder}
        aria-describedby={descId}
        onChange={(e) => aoMudar(e.target.value)}
        className="rounded border border-app-border-input bg-app-surface px-3 py-2 text-sm text-app-fg placeholder:text-app-fg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul focus-visible:ring-offset-1 focus-visible:ring-offset-app-surface"
      />
    </div>
  );
}

export function CampoSelectForm({
  rotulo,
  valor,
  aoMudar,
  opcoes,
  placeholder,
}: {
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
  opcoes: { valor: string; rotulo: string }[];
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-app-fg">
        {rotulo}
      </label>
      <div className="relative">
        <select
          id={id}
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
          className="w-full appearance-none rounded border border-app-border-input bg-app-surface px-3 py-2 pr-8 text-sm text-app-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul"
        >
          {placeholder ? <option value="">{placeholder}</option> : null}
          {opcoes.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.rotulo}
            </option>
          ))}
        </select>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-app-fg-muted"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M3 4.5L6 7.5L9 4.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>
    </div>
  );
}
