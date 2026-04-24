'use client';

import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

/**
 * Aba representando um grupo de arquivos. O `conteudo` já vem renderizado
 * pelo Server Component pai — assim dados formatados via `toLocaleDateString`
 * e similares ficam serializados no HTML inicial, evitando hydration
 * mismatch entre Node (server) e browser (client).
 */
export interface AbaArquivos {
  id: string;
  rotulo: string;
  contagem: number;
  conteudo: ReactNode;
}

export interface AbasArquivosProps {
  abas: AbaArquivos[];
}

/**
 * Tablist acessível (padrão W3C ARIA APG — Tabs with Automatic Activation).
 *
 * Teclado:
 *   ← / →   : navega entre abas (circular)
 *   Home    : primeira aba
 *   End     : última aba
 *   Enter/Space (via clique nativo): ativa aba focada
 *
 * Acessibilidade:
 *   - role="tablist" no container
 *   - role="tab" nos botões, com aria-selected + aria-controls + id
 *   - role="tabpanel" no painel ativo, com aria-labelledby
 *   - roving tabindex: só a aba selecionada é Tab-alcançável (0), outras -1
 *   - focus-visible ring em gov-azul
 *
 * Se houver só 1 grupo, retorna o conteúdo direto com título h3 (abas seriam
 * ruído visual sem utilidade).
 */
export function AbasArquivos({ abas }: AbasArquivosProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const [ativaId, setAtivaId] = useState<string>(abas[0]?.id ?? '');

  const primeira = abas[0];
  if (!primeira) return null;

  if (abas.length === 1) {
    const headingId = `grupo-${primeira.id}`;
    return (
      <section aria-labelledby={headingId}>
        <h3
          id={headingId}
          className="mb-2 flex items-baseline gap-2 border-b border-app-border-subtle pb-1"
        >
          <span className="text-sm font-semibold text-app-fg">
            {primeira.rotulo}
          </span>
          <span className="text-xs font-normal text-app-fg-muted tabular">
            {primeira.contagem}
          </span>
        </h3>
        {primeira.conteudo}
      </section>
    );
  }

  function focarAba(indice: number) {
    const alvo = ((indice % abas.length) + abas.length) % abas.length;
    const proxima = abas[alvo];
    if (!proxima) return;
    setAtivaId(proxima.id);
    refs.current[alvo]?.focus();
  }

  function onKey(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        focarAba(i + 1);
        return;
      case 'ArrowLeft':
        e.preventDefault();
        focarAba(i - 1);
        return;
      case 'Home':
        e.preventDefault();
        focarAba(0);
        return;
      case 'End':
        e.preventDefault();
        focarAba(abas.length - 1);
        return;
    }
  }

  const abaAtiva = abas.find((a) => a.id === ativaId) ?? primeira;

  return (
    <div>
      <div
        role="tablist"
        aria-label="Grupos de arquivos"
        className="flex gap-1 overflow-x-auto border-b border-app-border-subtle"
      >
        {abas.map((aba, i) => {
          const selecionada = aba.id === abaAtiva.id;
          return (
            <button
              key={aba.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`tab-${aba.id}`}
              aria-selected={selecionada}
              aria-controls={`painel-${aba.id}`}
              tabIndex={selecionada ? 0 : -1}
              onClick={() => setAtivaId(aba.id)}
              onKeyDown={(e) => onKey(e, i)}
              className={[
                'shrink-0 -mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm transition-colors motion-safe:duration-100',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul',
                selecionada
                  ? 'border-gov-azul font-medium text-gov-azul'
                  : 'border-transparent text-app-fg-muted hover:border-app-border-subtle hover:text-app-fg',
              ].join(' ')}
            >
              <span>{aba.rotulo}</span>
              <span
                aria-hidden="true"
                className={[
                  'mono tabular rounded px-1.5 text-2xs font-semibold',
                  selecionada
                    ? 'bg-gov-azul-claro text-gov-azul'
                    : 'bg-app-surface-2 text-app-fg-subtle',
                ].join(' ')}
              >
                {aba.contagem}
              </span>
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={`painel-${abaAtiva.id}`}
        aria-labelledby={`tab-${abaAtiva.id}`}
        tabIndex={0}
        className="mt-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul focus-visible:outline-offset-2"
      >
        {abaAtiva.conteudo}
      </div>
    </div>
  );
}
