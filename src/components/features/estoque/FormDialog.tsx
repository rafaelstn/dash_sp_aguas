'use client';

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import { enviarUmaVez, erroParaExibir, type ErroExibido } from './form-dialog-envio';

export { ErroDeCampo } from './form-dialog-envio';

interface FormDialogProps {
  aberto: boolean;
  titulo: string;
  rotuloConfirmar?: string;
  /**
   * Executa o envio. Deve lancar Error (mensagem) em caso de falha, ou
   * `ErroDeCampo` quando a falha pertence a um campo com a prop `campo`.
   */
  aoSalvar: () => Promise<void>;
  aoFechar: () => void;
  children: React.ReactNode;
}

interface ContextoForm {
  erro: ErroExibido | null;
  idErro: string;
  registrar: (campo: string) => () => void;
}

const ContextoFormDialog = createContext<ContextoForm | null>(null);

/**
 * Liga um campo ao erro do diálogo: registra o nome (para o erro de campo saber
 * que ele existe) e devolve se ele é o campo inválido agora.
 */
export function useErroDoCampo(campo: string | undefined) {
  const ctx = useContext(ContextoFormDialog);
  const registrar = ctx?.registrar;
  useEffect(() => {
    if (campo && registrar) return registrar(campo);
    return undefined;
  }, [campo, registrar]);
  const erro = ctx && campo && ctx.erro?.campo === campo ? ctx.erro : null;
  return {
    invalido: erro !== null,
    idErro: erro ? ctx!.idErro : undefined,
    mensagem: erro?.mensagem ?? null,
    anunciar: erro?.anunciar ?? false,
  };
}

/** Junta ids de aria-describedby ignorando os ausentes. */
export function idsDescritos(...ids: (string | undefined)[]): string | undefined {
  const lista = ids.filter(Boolean);
  return lista.length > 0 ? lista.join(' ') : undefined;
}

/** Mensagem de erro logo abaixo do campo inválido. */
export function MensagemErroCampo({
  id,
  mensagem,
  anunciar,
}: {
  id: string | undefined;
  mensagem: string | null;
  anunciar: boolean;
}) {
  if (!id || !mensagem) return null;
  return (
    <p id={id} role={anunciar ? 'alert' : undefined} className="text-xs font-medium text-gov-perigo">
      {mensagem}
    </p>
  );
}

const CLASSE_INVALIDO = 'aria-[invalid=true]:border-gov-perigo';

/**
 * Shell de formulario em `<dialog>` modal, reutilizado pelos CRUDs do estoque
 * (material, unidade, local, categoria). Trava o envio (ref, contra dois submits
 * no mesmo tick), exibe erro e nunca usa dialog nativo do navegador. A11y: foco
 * inicial no primeiro campo, Esc/cancelar fecham quando ocioso. Erro geral vai
 * para o fim da area rolavel com role=alert e e rolado ate ficar visivel; erro
 * de campo marca o campo com aria-invalid, descreve com a mensagem e recebe o foco.
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
  const confirmarRef = useRef<HTMLButtonElement>(null);
  const travaRef = useRef(false);
  const camposRef = useRef(new Map<string, number>());
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<ErroExibido | null>(null);
  const baseId = useId();
  const idErro = `${baseId}-erro`;

  const registrar = useCallback((campo: string) => {
    const mapa = camposRef.current;
    mapa.set(campo, (mapa.get(campo) ?? 0) + 1);
    return () => {
      const n = (mapa.get(campo) ?? 1) - 1;
      if (n <= 0) mapa.delete(campo);
      else mapa.set(campo, n);
    };
  }, []);

  const contexto = useMemo<ContextoForm>(() => ({ erro, idErro, registrar }), [erro, idErro, registrar]);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (aberto && !dlg.open) {
      dlg.showModal();
      requestAnimationFrame(() => {
        const campo = dlg.querySelector<HTMLElement>(
          'input:not(:disabled), select:not(:disabled), textarea:not(:disabled)',
        );
        (campo ?? confirmarRef.current)?.focus();
      });
    } else if (!aberto && dlg.open) {
      dlg.close();
    }
  }, [aberto]);

  useEffect(() => {
    if (aberto) {
      travaRef.current = false;
      setSalvando(false);
      setErro(null);
    }
  }, [aberto]);

  // Depois do commit do erro: foco no campo inválido (erro de campo) e a
  // mensagem rolada para dentro da área visível. No celular o alerta geral nasce
  // abaixo da dobra do corpo rolável e ficava invisível.
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!erro || !dlg?.open) return;
    if (erro.campo) {
      const campo = dlg.querySelector<HTMLElement>(`[data-campo="${CSS.escape(erro.campo)}"]`);
      if (campo && !campo.matches(':disabled') && document.activeElement !== campo) campo.focus();
    }
    document.getElementById(idErro)?.scrollIntoView({ block: 'nearest' });
    // O campo em foco pode ter ficado desabilitado pelo erro (ex.: item já
    // cadastrado trava o fieldset). Foco perdido cai no BODY (WCAG 2.4.3).
    if (!dlg.contains(document.activeElement)) confirmarRef.current?.focus();
  }, [erro, idErro]);

  async function submeter() {
    const ativo = document.activeElement;
    const campoEmFoco = ativo instanceof HTMLElement ? ativo.getAttribute('data-campo') : null;
    const r = await enviarUmaVez(travaRef, async () => {
      setSalvando(true);
      setErro(null);
      await aoSalvar();
    });
    if (!r.executou || r.erro === null) return;
    setErro(erroParaExibir(r.erro, campoEmFoco, new Set(camposRef.current.keys())));
    setSalvando(false);
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
      {/* noValidate: a mensagem de campo obrigatorio e a da casa, nao o balao
          do navegador; `required` segue expondo aria-required. */}
      <form
        method="dialog"
        noValidate
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
          <ContextoFormDialog.Provider value={contexto}>{children}</ContextoFormDialog.Provider>
          {erro && erro.campo === null ? (
            <div
              id={idErro}
              role="alert"
              className="scroll-my-4 rounded border-l-4 border-gov-perigo bg-red-50 p-3 text-sm text-gov-perigo"
            >
              {erro.mensagem}
            </div>
          ) : null}
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-app-border-subtle bg-app-surface-2 px-5 py-3 sm:flex-row sm:justify-end">
          {/* aria-disabled em vez de disabled: botao desabilitado perde o foco
              para o BODY no meio do envio. O bloqueio real esta no handler. */}
          <button
            type="button"
            onClick={() => {
              if (!salvando) aoFechar();
            }}
            aria-disabled={salvando || undefined}
            className="rounded border border-app-border-subtle bg-app-surface px-3 py-1.5 text-sm font-medium text-app-fg hover:bg-app-surface-2 aria-disabled:cursor-not-allowed aria-disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
          >
            Cancelar
          </button>
          <button
            ref={confirmarRef}
            type="submit"
            aria-disabled={salvando || undefined}
            className="rounded bg-gov-azul px-3 py-1.5 text-sm font-medium text-white hover:bg-gov-azul-escuro aria-disabled:cursor-not-allowed aria-disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
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
  campo,
}: {
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
  obrigatorio?: boolean;
  placeholder?: string;
  descricao?: string;
  /** Nome usado por `ErroDeCampo` para marcar e focar este campo. */
  campo?: string;
}) {
  const id = useId();
  const descId = descricao ? `${id}-desc` : undefined;
  const erro = useErroDoCampo(campo);
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-app-fg">
        {rotulo}
        {obrigatorio ? (
          <span aria-hidden="true" className="text-gov-perigo">
            {' *'}
          </span>
        ) : null}
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
        aria-required={obrigatorio || undefined}
        placeholder={placeholder}
        data-campo={campo}
        aria-invalid={erro.invalido || undefined}
        aria-describedby={idsDescritos(erro.idErro, descId)}
        onChange={(e) => aoMudar(e.target.value)}
        className={`rounded border border-app-border-input bg-app-surface px-3 py-2 text-sm text-app-fg placeholder:text-app-fg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul focus-visible:ring-offset-1 focus-visible:ring-offset-app-surface ${CLASSE_INVALIDO}`}
      />
      <MensagemErroCampo id={erro.idErro} mensagem={erro.mensagem} anunciar={erro.anunciar} />
    </div>
  );
}

export function CampoNumeroForm({
  rotulo,
  valor,
  aoMudar,
  min,
  step = 1,
  placeholder,
  descricao,
  campo,
}: {
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
  min?: number;
  step?: number;
  placeholder?: string;
  descricao?: string;
  /** Nome usado por `ErroDeCampo` para marcar e focar este campo. */
  campo?: string;
}) {
  const id = useId();
  const descId = descricao ? `${id}-desc` : undefined;
  const erro = useErroDoCampo(campo);
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-app-fg">
        {rotulo}
      </label>
      {descricao ? (
        <span id={descId} className="text-2xs text-app-fg-muted">
          {descricao}
        </span>
      ) : null}
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        step={step}
        value={valor}
        placeholder={placeholder}
        data-campo={campo}
        aria-invalid={erro.invalido || undefined}
        aria-describedby={idsDescritos(erro.idErro, descId)}
        onChange={(e) => aoMudar(e.target.value)}
        className={`rounded border border-app-border-input bg-app-surface px-3 py-2 text-sm text-app-fg placeholder:text-app-fg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul focus-visible:ring-offset-1 focus-visible:ring-offset-app-surface ${CLASSE_INVALIDO}`}
      />
      <MensagemErroCampo id={erro.idErro} mensagem={erro.mensagem} anunciar={erro.anunciar} />
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
