'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ErroTriagemAPI,
  iniciarRevisaoCliente,
  mensagemErroTriagem,
  tempoRelativo,
} from '@/lib/triagem-api';
import {
  DialogConfirmarDecisao,
  type AcaoDecisao,
} from './DialogConfirmarDecisao';
import type { EstadoTriagem } from '@/domain/triagem';

export interface BarraAcoesTriagemProps {
  triagemId: string;
  estado: EstadoTriagem;
  /** True se o lock atual da revisão pertence ao usuário logado. */
  donoDoLock: boolean;
  /** True se outro aprovador detém o lock. */
  outroAprovadorComLock: boolean;
  /** Quando expira o lock atual (qualquer dono). Apenas se em_revisao. */
  lockExpiraEm: Date | null;
}

/**
 * Barra de ações da tela de detalhe da triagem. Renderiza os botões
 * pertinentes ao estado da máquina (ADR-0008 §4) e abre os diálogos.
 *
 * Implementa atalhos de teclado:
 *  - r → iniciar revisão (estado pendente)
 *  - a → aprovar  (estado em_revisao + dono do lock)
 *  - x → rejeitar (idem)
 *  - d → devolver (idem)
 * Atalhos são ignorados quando o foco está em campos editáveis ou em
 * modal aberto.
 */
export function BarraAcoesTriagem({
  triagemId,
  estado,
  donoDoLock,
  outroAprovadorComLock,
  lockExpiraEm,
}: BarraAcoesTriagemProps) {
  const router = useRouter();
  const [acaoAberta, setAcaoAberta] = useState<AcaoDecisao | null>(null);
  const [iniciandoRevisao, setIniciandoRevisao] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const podeAgir = estado === 'em_revisao' && donoDoLock;
  const podeIniciar = estado === 'pendente';

  const iniciarRevisao = useCallback(async () => {
    if (iniciandoRevisao) return;
    setIniciandoRevisao(true);
    setErro(null);
    try {
      await iniciarRevisaoCliente(triagemId);
      router.refresh();
    } catch (e) {
      if (e instanceof ErroTriagemAPI) {
        setErro(mensagemErroTriagem(e));
      } else {
        setErro('Falha inesperada ao iniciar revisão.');
      }
    } finally {
      setIniciandoRevisao(false);
    }
  }, [iniciandoRevisao, triagemId, router]);

  // ──────────── atalhos de teclado ────────────
  useEffect(() => {
    function emEdicao(alvo: EventTarget | null): boolean {
      if (!(alvo instanceof HTMLElement)) return false;
      const tag = alvo.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (alvo.isContentEditable) return true;
      return false;
    }

    function onKey(e: KeyboardEvent) {
      if (acaoAberta) return; // dialog aberta intercepta atalhos
      if (emEdicao(e.target)) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;

      switch (e.key) {
        case 'r':
          if (podeIniciar) {
            e.preventDefault();
            void iniciarRevisao();
          }
          return;
        case 'a':
          if (podeAgir) {
            e.preventDefault();
            setAcaoAberta('aprovar');
          }
          return;
        case 'x':
          if (podeAgir) {
            e.preventDefault();
            setAcaoAberta('rejeitar');
          }
          return;
        case 'd':
          if (podeAgir) {
            e.preventDefault();
            setAcaoAberta('devolver');
          }
          return;
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [acaoAberta, podeAgir, podeIniciar, iniciarRevisao]);

  function aoSucesso() {
    setAcaoAberta(null);
    router.refresh();
  }

  return (
    <div
      role="toolbar"
      aria-label="Ações da triagem"
      className="flex flex-col gap-2 rounded-gov-card border border-app-border-subtle bg-app-surface p-3 sm:flex-row sm:flex-wrap sm:items-center"
    >
      {erro ? (
        <p
          role="alert"
          className="w-full rounded border-l-4 border-gov-perigo bg-red-50 p-2 text-xs text-gov-perigo"
        >
          {erro}
        </p>
      ) : null}

      {podeIniciar ? (
        <button
          type="button"
          onClick={iniciarRevisao}
          disabled={iniciandoRevisao}
          aria-keyshortcuts="r"
          className="rounded bg-gov-azul px-3 py-1.5 text-sm font-medium text-white hover:bg-gov-azul-escuro disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
        >
          {iniciandoRevisao ? 'Iniciando…' : 'Iniciar revisão'}
          <kbd className="mono ml-2 rounded bg-white/20 px-1 text-2xs">r</kbd>
        </button>
      ) : null}

      {estado === 'em_revisao' && donoDoLock ? (
        <>
          <span className="text-xs text-app-fg-muted">
            Você está revisando esta ficha.
            {lockExpiraEm
              ? ` Lock expira ${tempoRelativo(lockExpiraEm)}.`
              : null}
          </span>
          <div className="flex flex-wrap gap-2 sm:ml-auto">
            <button
              type="button"
              onClick={() => setAcaoAberta('devolver')}
              aria-keyshortcuts="d"
              className="rounded border border-orange-600 bg-white px-3 py-1.5 text-sm font-medium text-orange-700 hover:bg-orange-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul"
            >
              Devolver
              <kbd className="mono ml-2 rounded border border-orange-300 px-1 text-2xs">
                d
              </kbd>
            </button>
            <button
              type="button"
              onClick={() => setAcaoAberta('rejeitar')}
              aria-keyshortcuts="x"
              className="rounded border border-gov-perigo bg-white px-3 py-1.5 text-sm font-medium text-gov-perigo hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul"
            >
              Rejeitar
              <kbd className="mono ml-2 rounded border border-red-300 px-1 text-2xs">
                x
              </kbd>
            </button>
            <button
              type="button"
              onClick={() => setAcaoAberta('aprovar')}
              aria-keyshortcuts="a"
              className="rounded bg-green-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
            >
              Aprovar
              <kbd className="mono ml-2 rounded bg-white/20 px-1 text-2xs">
                a
              </kbd>
            </button>
          </div>
        </>
      ) : null}

      {estado === 'em_revisao' && outroAprovadorComLock ? (
        <BannerLockOutroAprovador lockExpiraEm={lockExpiraEm} />
      ) : null}

      {acaoAberta ? (
        <DialogConfirmarDecisao
          triagemId={triagemId}
          acao={acaoAberta}
          aberto={true}
          aoFechar={() => setAcaoAberta(null)}
          aoSucesso={aoSucesso}
        />
      ) : null}
    </div>
  );
}

function BannerLockOutroAprovador({
  lockExpiraEm,
}: {
  lockExpiraEm: Date | null;
}) {
  const expiraTexto = lockExpiraEm ? tempoRelativo(lockExpiraEm) : 'em até 1 hora';

  return (
    <div className="w-full rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="font-semibold">Ficha em revisão por outro aprovador.</p>
      <p className="mt-1">
        O lock será liberado automaticamente {expiraTexto}. Aguarde a
        liberação ou contate o aprovador atual antes de retomar a revisão.
      </p>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer">
          Por que não posso forçar a liberação?
        </summary>
        <p className="mt-1">
          A liberação manual de lock por terceiros não está disponível neste
          momento. O sistema libera automaticamente após uma hora sem
          atividade do revisor atual.
        </p>
      </details>
    </div>
  );
}
