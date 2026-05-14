'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  ErroTriagemAPI,
  aprovarTriagemCliente,
  devolverTriagemCliente,
  mensagemErroTriagem,
  rejeitarTriagemCliente,
} from '@/lib/triagem-api';

export type AcaoDecisao = 'aprovar' | 'rejeitar' | 'devolver';

const TITULO: Record<AcaoDecisao, string> = {
  aprovar: 'Aprovar ficha',
  rejeitar: 'Rejeitar ficha',
  devolver: 'Devolver ficha para correção',
};

const DESCRICAO: Record<AcaoDecisao, string> = {
  aprovar:
    'A confirmação promove a ficha para a base de produção e a torna imutável. A operação não pode ser desfeita.',
  rejeitar:
    'A confirmação registra a rejeição e encerra o ciclo da ficha. A justificativa informada abaixo ficará disponível para o técnico responsável.',
  devolver:
    'A confirmação devolve a ficha ao técnico para correção. Descreva de forma clara e objetiva o que precisa ser ajustado antes da nova submissão.',
};

const ROTULO_BOTAO: Record<AcaoDecisao, string> = {
  aprovar: 'Confirmar aprovação',
  rejeitar: 'Confirmar rejeição',
  devolver: 'Confirmar devolução',
};

const VARIANTE_BOTAO: Record<AcaoDecisao, string> = {
  aprovar: 'bg-green-700 hover:bg-green-800 text-white',
  rejeitar: 'bg-gov-perigo hover:bg-red-900 text-white',
  devolver: 'bg-orange-600 hover:bg-orange-700 text-white',
};

const TAMANHO_MIN_MOTIVO = 20;

export interface DialogConfirmarDecisaoProps {
  triagemId: string;
  acao: AcaoDecisao;
  aberto: boolean;
  aoFechar: () => void;
  /** Callback após sucesso. UI deve fazer refresh dos dados. */
  aoSucesso: () => void;
}

/**
 * Modal de confirmação de decisão da triagem (aprovar, rejeitar,
 * devolver). Usa `<dialog>` nativo do HTML, sem dependência externa.
 *
 * Aprovar: confirmação simples + warning de irreversibilidade.
 * Rejeitar / Devolver: textarea obrigatória ≥ 20 chars com contador.
 *
 * Erros do backend são mapeados via `mensagemErroTriagem`.
 */
export function DialogConfirmarDecisao({
  triagemId,
  acao,
  aberto,
  aoFechar,
  aoSucesso,
}: DialogConfirmarDecisaoProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erroMensagem, setErroMensagem] = useState<string | null>(null);
  const erroId = useId();
  const motivoId = useId();

  const exigeMotivo = acao === 'rejeitar' || acao === 'devolver';
  const tamanhoMotivo = motivo.trim().length;
  const motivoValido = !exigeMotivo || tamanhoMotivo >= TAMANHO_MIN_MOTIVO;

  // Abre/fecha o <dialog> imperativamente — `open=` em React e modal mode
  // não convivem bem; showModal() é o caminho recomendado pelo HTML.
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (aberto && !dlg.open) {
      dlg.showModal();
      // foca o campo certo na abertura: textarea quando exige motivo,
      // botão de confirmar caso contrário.
      setTimeout(() => {
        if (exigeMotivo) {
          textareaRef.current?.focus();
        } else {
          dlg.querySelector<HTMLButtonElement>('button[data-acao="confirmar"]')?.focus();
        }
      }, 0);
    } else if (!aberto && dlg.open) {
      dlg.close();
    }
  }, [aberto, exigeMotivo]);

  // Reset do estado a cada nova abertura.
  useEffect(() => {
    if (aberto) {
      setMotivo('');
      setErroMensagem(null);
      setEnviando(false);
    }
  }, [aberto, acao]);

  function fechar() {
    if (enviando) return;
    aoFechar();
  }

  async function confirmar() {
    if (enviando) return;
    if (exigeMotivo && !motivoValido) {
      textareaRef.current?.focus();
      return;
    }
    setEnviando(true);
    setErroMensagem(null);
    try {
      if (acao === 'aprovar') {
        await aprovarTriagemCliente(triagemId);
      } else if (acao === 'rejeitar') {
        await rejeitarTriagemCliente(triagemId, motivo.trim());
      } else {
        await devolverTriagemCliente(triagemId, motivo.trim());
      }
      aoSucesso();
    } catch (e) {
      if (e instanceof ErroTriagemAPI) {
        setErroMensagem(mensagemErroTriagem(e));
      } else {
        setErroMensagem(
          'Não foi possível concluir a operação. Tente novamente em instantes.',
        );
      }
    } finally {
      setEnviando(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        // Esc fecha o <dialog> nativo — interceptamos para sincronizar
        // o estado React e, se estiver enviando, bloquear o fechamento.
        if (enviando) {
          e.preventDefault();
          return;
        }
        aoFechar();
      }}
      onClose={() => {
        // Garante sincronia com o estado React quando fechado por outro
        // mecanismo do navegador.
        if (aberto) aoFechar();
      }}
      aria-labelledby={`${motivoId}-titulo`}
      aria-describedby={`${motivoId}-desc`}
      className="m-0 max-w-lg rounded-gov-card border border-app-border-subtle bg-app-surface p-0 text-app-fg shadow-gov-card-hover backdrop:bg-black/40 sm:m-auto"
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
          <h2 id={`${motivoId}-titulo`} className="text-lg font-semibold">
            {TITULO[acao]}
          </h2>
        </header>

        <div className="space-y-3 px-5 py-4">
          <p id={`${motivoId}-desc`} className="text-sm text-app-fg">
            {DESCRICAO[acao]}
          </p>

          {exigeMotivo ? (
            <div>
              <label
                htmlFor={motivoId}
                className="mb-1 block text-xs font-medium text-app-fg"
              >
                Justificativa
                <span aria-hidden="true" className="text-gov-perigo">
                  {' '}
                  *
                </span>
              </label>
              <textarea
                id={motivoId}
                ref={textareaRef}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                required
                minLength={TAMANHO_MIN_MOTIVO}
                maxLength={2000}
                rows={5}
                disabled={enviando}
                aria-describedby={`${motivoId}-ajuda${erroMensagem ? ` ${erroId}` : ''}`}
                aria-invalid={!motivoValido && tamanhoMotivo > 0}
                className="block w-full rounded border border-app-border-subtle bg-app-surface px-2 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul disabled:opacity-60"
                placeholder={
                  acao === 'rejeitar'
                    ? 'Descreva os motivos que impedem a aprovação desta ficha.'
                    : 'Descreva os ajustes necessários para que o técnico possa re-submeter a ficha.'
                }
              />
              <div
                id={`${motivoId}-ajuda`}
                className="mt-1 flex items-center justify-between text-2xs"
              >
                <span
                  className={
                    motivoValido
                      ? 'text-app-fg-muted'
                      : 'text-gov-perigo'
                  }
                >
                  A justificativa precisa ter ao menos {TAMANHO_MIN_MOTIVO} caracteres.
                </span>
                <span
                  className={[
                    'mono tabular',
                    motivoValido ? 'text-green-700' : 'text-app-fg-muted',
                  ].join(' ')}
                  aria-live="polite"
                >
                  {tamanhoMotivo}/{TAMANHO_MIN_MOTIVO}
                </span>
              </div>
            </div>
          ) : null}

          {erroMensagem ? (
            <div
              id={erroId}
              role="alert"
              className="rounded border-l-4 border-gov-perigo bg-red-50 p-3 text-sm text-gov-perigo"
            >
              <p className="font-semibold">
                Não foi possível concluir a operação.
              </p>
              <p className="mt-0.5">{erroMensagem}</p>
            </div>
          ) : null}
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-app-border-subtle bg-app-surface-2 px-5 py-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={fechar}
            disabled={enviando}
            className="rounded border border-app-border-subtle bg-app-surface px-3 py-1.5 text-sm font-medium text-app-fg hover:bg-app-surface-2 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul"
          >
            Cancelar
          </button>
          <button
            type="submit"
            data-acao="confirmar"
            disabled={enviando || (exigeMotivo && !motivoValido)}
            className={[
              'rounded px-3 py-1.5 text-sm font-medium disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul',
              VARIANTE_BOTAO[acao],
            ].join(' ')}
          >
            {enviando ? 'Processando solicitação…' : ROTULO_BOTAO[acao]}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
