'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

interface AtalhoItem {
  tecla: string;
  acao: string;
}

const ATALHOS_GERAIS: AtalhoItem[] = [
  { tecla: '/', acao: 'Focar o campo de busca' },
  { tecla: 'P', acao: 'Ir para Painel' },
  { tecla: 'F', acao: 'Ir para Favoritos (ou alternar favorito na ficha)' },
  { tecla: 'D', acao: 'Ir para Desconformidades' },
  { tecla: 'T', acao: 'Ir para Triagem' },
  { tecla: 'M', acao: 'Ir para Monitor (mapa pluviométrico)' },
  { tecla: 'H', acao: 'Ir para Home (busca de postos)' },
  { tecla: 'Esc', acao: 'Limpar filtros (na home)' },
  { tecla: '?', acao: 'Abrir/fechar esta ajuda' },
];

const ATALHOS_TRIAGEM_LISTA: AtalhoItem[] = [
  { tecla: 'J', acao: 'Selecionar próxima ficha da fila' },
  { tecla: 'K', acao: 'Selecionar ficha anterior' },
  { tecla: 'Enter', acao: 'Abrir detalhe da ficha selecionada' },
];

const ATALHOS_TRIAGEM_DETALHE: AtalhoItem[] = [
  { tecla: 'R', acao: 'Iniciar revisão (estado pendente)' },
  { tecla: 'A', acao: 'Aprovar ficha (em revisão)' },
  { tecla: 'X', acao: 'Rejeitar ficha (em revisão)' },
  { tecla: 'D', acao: 'Devolver ficha ao técnico (em revisão)' },
];

export interface DialogAjudaAtalhosProps {
  aberto: boolean;
  aoFechar: () => void;
}

/**
 * Diálogo de ajuda de atalhos, baseado em <dialog> HTML5 nativo. Ganha
 * focus trap, ESC pra fechar e gerenciamento de foco "de graça" pelo
 * browser. Substitui a versão anterior em <div role="dialog"> que vazava
 * o foco para o resto da página (WCAG 2.4.3).
 *
 * Os blocos de atalhos de triagem só aparecem quando a rota atual é
 * /triagem*, evitando o "atalho fantasma" reportado em auditoria. Para
 * usuários comuns na home, o diálogo mostra apenas atalhos globais.
 */
export function DialogAjudaAtalhos({ aberto, aoFechar }: DialogAjudaAtalhosProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const naTriagem = pathname?.startsWith('/triagem') ?? false;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberto && !d.open) d.showModal();
    else if (!aberto && d.open) d.close();
  }, [aberto]);

  return (
    // ESC e click no backdrop fecham o dialog. <dialog> nativo é elemento
    // interativo por especificação, mas o plugin jsx-a11y classifica como
    // "non-interactive" e dispara dois falsos positivos quando há onClick.
    /* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events */
    <dialog
      ref={ref}
      aria-labelledby="titulo-ajuda-atalhos"
      onClose={aoFechar}
      onClick={(e) => {
        if (e.target === ref.current) aoFechar();
      }}
      className="max-w-md w-full max-h-[85vh] overflow-y-auto rounded-gov-card border border-gov-borda bg-white p-5 shadow-gov-card-hover backdrop:bg-black/40"
    >
      <div role="document" className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <h2 id="titulo-ajuda-atalhos" className="text-lg font-semibold text-gov-texto">
            Atalhos de teclado
          </h2>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar ajuda"
            className="rounded text-xl leading-none text-gov-muted hover:text-gov-texto focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul"
          >
            ×
          </button>
        </div>

        <Bloco titulo="Navegação" itens={ATALHOS_GERAIS} />
        {naTriagem ? (
          <>
            <Bloco titulo="Lista de triagem" itens={ATALHOS_TRIAGEM_LISTA} />
            <Bloco titulo="Detalhe da triagem" itens={ATALHOS_TRIAGEM_DETALHE} />
          </>
        ) : (
          <p className="text-xs text-gov-muted">
            Atalhos específicos de triagem (J/K, R/A/X/D) aparecem aqui quando você está em <code className="mono">/triagem</code>.
          </p>
        )}

        <p className="text-xs text-gov-muted">
          Atalhos são ignorados quando você está digitando em um campo.
        </p>
      </div>
    </dialog>
    /* eslint-enable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events */
  );
}

function Bloco({
  titulo,
  itens,
}: {
  titulo: string;
  itens: AtalhoItem[];
}) {
  return (
    <section>
      <h3 className="mb-1 text-2xs font-semibold uppercase tracking-wider text-gov-muted">
        {titulo}
      </h3>
      <dl className="divide-y divide-gov-borda text-sm">
        {itens.map((a) => (
          <div
            key={a.tecla}
            className="flex items-center justify-between gap-4 py-1.5"
          >
            <dt className="text-gov-muted">{a.acao}</dt>
            <dd>
              <kbd className="rounded border border-gov-borda bg-gov-superficie-2 px-2 py-1 font-mono text-xs text-gov-texto">
                {a.tecla}
              </kbd>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
