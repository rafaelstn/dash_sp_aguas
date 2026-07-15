'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UNIDADES_FISICAS } from '@/domain/estoque/local';
import { listarLocais } from '../api';
import { abrirConferencia } from '../conferencia-api';
import { ErroEstoque } from '../erros';
import { ROTULO_NATUREZA, ROTULO_UNIDADE_FISICA } from '../rotulos';
import type { LocalDTO, UnidadeFisica } from '../dtos';
import type { NaturezaConferida } from '../conferencia-dtos';

interface Props {
  aberto: boolean;
  aoFechar: () => void;
  /** Chamado apos abrir com sucesso (mensagem para anunciar). Antes de navegar. */
  aoAbrir: (mensagem: string) => void;
}

const CLASSE_SELECT =
  'w-full appearance-none rounded border border-app-border-input bg-app-surface px-3 py-2 pr-8 text-sm text-app-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul';

/**
 * Dialog de abrir conferencia (admin). Escolhe unidade + natureza + local
 * opcional; confirma e o backend congela o snapshot do esperado. Trata o 409
 * (ja ha sessao aberta no escopo) com mensagem clara. Ao abrir, navega para o
 * detalhe da nova sessao. A11y: <dialog> modal, labels, foco inicial, erro
 * com role=alert.
 */
export function AbrirConferenciaDialog({ aberto, aoFechar, aoAbrir }: Props) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const baseId = useId();

  const [unidade, setUnidade] = useState<UnidadeFisica>('PENHA');
  const [natureza, setNatureza] = useState<NaturezaConferida>('serializado');
  const [localId, setLocalId] = useState('');
  const [locais, setLocais] = useState<LocalDTO[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto) return;
    setUnidade('PENHA');
    setNatureza('serializado');
    setLocalId('');
    setErro(null);
    setEnviando(false);
  }, [aberto]);

  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (aberto && !dlg.open) {
      dlg.showModal();
      requestAnimationFrame(() => {
        dlg.querySelector<HTMLSelectElement>('select[data-inicial]')?.focus();
      });
    } else if (!aberto && dlg.open) {
      dlg.close();
    }
  }, [aberto]);

  // Locais da unidade selecionada (o escopo por local e opcional).
  useEffect(() => {
    if (!aberto) return;
    let ativo = true;
    const c = new AbortController();
    listarLocais(unidade, c.signal)
      .then((r) => {
        if (ativo) setLocais(r.itens);
      })
      .catch(() => {
        if (ativo) setLocais([]);
      });
    return () => {
      ativo = false;
      c.abort();
    };
  }, [aberto, unidade]);

  const locaisDaUnidade = useMemo(() => locais.filter((l) => l.unidade === unidade), [locais, unidade]);

  async function enviar() {
    setEnviando(true);
    setErro(null);
    try {
      const conf = await abrirConferencia({
        unidade,
        natureza,
        localId: localId || undefined,
      });
      aoAbrir(
        `Conferência aberta: ${ROTULO_UNIDADE_FISICA[unidade]} · ${ROTULO_NATUREZA[natureza]}.`,
      );
      router.push(`/estoque/conferencias/${conf.id}`);
    } catch (e) {
      setErro(
        e instanceof ErroEstoque
          ? e.message
          : 'Não foi possível abrir a conferência. Tente novamente.',
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
          void enviar();
        }}
        className="flex max-h-[85vh] flex-col"
      >
        <header className="border-b border-app-border-subtle px-5 py-3">
          <h2 id={`${baseId}-titulo`} className="text-lg font-semibold">
            Nova conferência
          </h2>
          <p className="mt-0.5 text-xs text-app-fg-muted">
            Ao abrir, o sistema congela o que é esperado no escopo. A partir daí, a contagem é
            comparada com esse retrato
          </p>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <Campo id={`${baseId}-unidade`} rotulo="Unidade">
            <div className="relative">
              <select
                id={`${baseId}-unidade`}
                data-inicial
                value={unidade}
                onChange={(e) => setUnidade(e.target.value as UnidadeFisica)}
                className={CLASSE_SELECT}
              >
                {UNIDADES_FISICAS.map((u) => (
                  <option key={u} value={u}>
                    {ROTULO_UNIDADE_FISICA[u]}
                  </option>
                ))}
              </select>
              <Seta />
            </div>
          </Campo>

          <Campo
            id={`${baseId}-natureza`}
            rotulo="Natureza"
            ajuda="Uma conferência cobre uma natureza. Serializados são itens individuais (patrimônio); quantificáveis têm saldo por local."
          >
            <div className="relative">
              <select
                id={`${baseId}-natureza`}
                value={natureza}
                onChange={(e) => setNatureza(e.target.value as NaturezaConferida)}
                className={CLASSE_SELECT}
              >
                <option value="serializado">{ROTULO_NATUREZA.serializado}</option>
                <option value="quantificavel">{ROTULO_NATUREZA.quantificavel}</option>
              </select>
              <Seta />
            </div>
          </Campo>

          <Campo
            id={`${baseId}-local`}
            rotulo="Local (opcional)"
            ajuda="Deixe em branco para conferir a unidade inteira, ou escolha um local para restringir o escopo."
          >
            <div className="relative">
              <select
                id={`${baseId}-local`}
                value={localId}
                onChange={(e) => setLocalId(e.target.value)}
                className={CLASSE_SELECT}
              >
                <option value="">Unidade inteira</option>
                {locaisDaUnidade.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.rotulo}
                  </option>
                ))}
              </select>
              <Seta />
            </div>
          </Campo>

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
            disabled={enviando}
            className="rounded bg-gov-azul px-3 py-1.5 text-sm font-medium text-white hover:bg-gov-azul-escuro disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
          >
            {enviando ? 'Abrindo…' : 'Abrir conferência'}
          </button>
        </footer>
      </form>
    </dialog>
  );
}

function Campo({
  id,
  rotulo,
  ajuda,
  children,
}: {
  id: string;
  rotulo: string;
  ajuda?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-app-fg">
        {rotulo}
      </label>
      {children}
      {ajuda ? <span className="text-2xs text-app-fg-muted">{ajuda}</span> : null}
    </div>
  );
}

function Seta() {
  return (
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
  );
}
