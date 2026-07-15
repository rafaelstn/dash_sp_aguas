'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { reconciliarItem } from '../conferencia-api';
import { ErroEstoque } from '../erros';
import { descreverAjuste } from '../conferencia-ui';
import type { ConferenciaItemDTO, ResultadoReconciliacaoDTO } from '../conferencia-dtos';
import type { Resolvedores } from './resolvedores';

interface Props {
  aberto: boolean;
  conferenciaId: string;
  item: ConferenciaItemDTO | null;
  resolvedores: Resolvedores;
  aoFechar: () => void;
  /** Chamado no sucesso com o resultado (para o painel notificar/atualizar). */
  aoReconciliar: (resultado: ResultadoReconciliacaoDTO) => void;
}

/**
 * Dialog de reconciliar UM item. SEMPRE mostra o ajuste que será gerado no
 * estoque e pede confirmação (nunca dispara mutação no clique sem revisão). O
 * `nao_encontrado` é carimbado como apurado, sem baixa automática. A11y:
 * <dialog> modal, foco inicial, erro com role=alert.
 */
export function ReconciliarDialog({
  aberto,
  conferenciaId,
  item,
  resolvedores,
  aoFechar,
  aoReconciliar,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const baseId = useId();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (aberto) {
      setEnviando(false);
      setErro(null);
    }
  }, [aberto, item?.id]);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (aberto && !dlg.open) {
      dlg.showModal();
      requestAnimationFrame(() => {
        dlg.querySelector<HTMLButtonElement>('button[data-acao="confirmar"]')?.focus();
      });
    } else if (!aberto && dlg.open) {
      dlg.close();
    }
  }, [aberto]);

  if (!item) {
    return <dialog ref={dialogRef} className="hidden" aria-hidden="true" />;
  }

  const ajuste = descreverAjuste(item, resolvedores.nomeLocal);

  async function confirmar() {
    if (!item) return;
    setEnviando(true);
    setErro(null);
    try {
      const resultado = await reconciliarItem(conferenciaId, item.id);
      aoReconciliar(resultado);
    } catch (e) {
      setErro(
        e instanceof ErroEstoque
          ? e.message
          : 'Não foi possível reconciliar o item. Tente novamente.',
      );
      setEnviando(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        if (enviando) {
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
          void confirmar();
        }}
        className="flex flex-col"
      >
        <header className="border-b border-app-border-subtle px-5 py-3">
          <h2 id={`${baseId}-titulo`} className="text-lg font-semibold">
            Reconciliar item
          </h2>
          <p className="mt-0.5 truncate text-xs text-app-fg-muted">
            {resolvedores.rotuloItem(item)}
          </p>
        </header>

        <div className="space-y-3 px-5 py-4">
          <div className="rounded border border-app-border-subtle bg-app-surface-2 p-3">
            <p className="text-2xs font-semibold uppercase tracking-wide text-app-fg-muted">
              Ajuste que será aplicado
            </p>
            <p className="mt-1 text-sm text-app-fg">{ajuste.texto}</p>
          </div>

          {ajuste.semMovimentacao ? (
            <p className="text-2xs text-app-fg-muted">
              Este item apenas será marcado como tratado; o estoque não muda.
            </p>
          ) : (
            <p className="text-2xs text-app-fg-muted">
              Uma movimentação será registrada na trilha de auditoria, vinculada a esta conferência.
            </p>
          )}

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
            disabled={enviando}
            className="rounded border border-app-border-subtle bg-app-surface px-3 py-1.5 text-sm font-medium text-app-fg hover:bg-app-surface-2 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
          >
            Cancelar
          </button>
          <button
            type="submit"
            data-acao="confirmar"
            disabled={enviando}
            className="rounded bg-gov-azul px-3 py-1.5 text-sm font-medium text-white hover:bg-gov-azul-escuro disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
          >
            {enviando ? 'Reconciliando…' : 'Confirmar reconciliação'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
