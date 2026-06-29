'use client';

import { useState } from 'react';
import { BarChart3, X, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { Estacao } from './tipos';
import { corComparacao } from './cores-comparacao';

interface CestaComparacaoProps {
  /** Estações na cesta, na ordem de inclusão (define a cor). */
  estacoes: readonly Estacao[];
  /** Teto da cesta (para o aviso de capacidade). */
  maximo: number;
  /** Remove uma estação da cesta. */
  aoRemover: (id: string) => void;
  /** Esvazia a cesta. */
  aoLimpar: () => void;
  /** Abre a visão de comparação (gráfico + tabela). */
  aoComparar: () => void;
}

/** Rótulo curto da estação para a lista da cesta. */
function rotuloEstacao(e: Estacao): string {
  return e.prefixo || e.nome || 'Estação';
}

/**
 * Cesta de comparação: barra fixa no rodapé que aparece quando há ao menos uma
 * estação selecionada. Mostra o contador, a lista das estações (cor + nome em
 * texto), permite remover individual, limpar tudo e abrir a comparação.
 *
 * Responsivo: no mobile a lista fica recolhida por padrão (só o resumo + ações),
 * expansível por um botão; no desktop a lista aparece junto. A cor nunca é a
 * única pista (cada item traz o nome em texto; o botão de remover tem aria-label).
 *
 * Acessibilidade: região rotulada (aria-label), live region no contador, foco
 * visível em todos os controles, e a confirmação de "limpar" usa o ConfirmDialog
 * do design system (sem window.confirm).
 */
export function CestaComparacao({
  estacoes,
  maximo,
  aoRemover,
  aoLimpar,
  aoComparar,
}: CestaComparacaoProps) {
  const [listaAberta, setListaAberta] = useState(false);
  const [confirmandoLimpar, setConfirmandoLimpar] = useState(false);

  if (estacoes.length === 0) return null;

  const total = estacoes.length;
  const podeComparar = total >= 2;
  const cheia = total >= maximo;

  return (
    <>
      <section
        aria-label="Cesta de comparação de estações"
        className="fixed inset-x-0 bottom-0 z-[600] border-t border-app-border-subtle bg-app-surface/95 shadow-gov-card-hover backdrop-blur"
      >
        <div className="mx-auto flex max-w-screen-xl flex-col gap-2 px-3 py-2.5 sm:px-4">
          {/* Linha de resumo + ações principais. */}
          <div className="flex items-center gap-3">
            <p
              className="flex items-center gap-2 text-sm font-medium text-app-fg"
              role="status"
              aria-live="polite"
            >
              <BarChart3 className="h-4 w-4 text-gov-azul" aria-hidden="true" />
              <span>
                {total} de {maximo}{' '}
                {total === 1 ? 'estação na comparação' : 'estações na comparação'}
              </span>
            </p>

            {/* Botão de expandir a lista (relevante no mobile). */}
            <button
              type="button"
              onClick={() => setListaAberta((v) => !v)}
              aria-expanded={listaAberta}
              aria-controls="cesta-comparacao-lista"
              className="inline-flex items-center gap-1 rounded border border-app-border-input px-2 py-1 text-xs text-app-fg hover:bg-app-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul sm:hidden"
            >
              {listaAberta ? (
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {listaAberta ? 'Ocultar' : 'Ver lista'}
            </button>

            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmandoLimpar(true)}
                className="inline-flex items-center gap-1.5 rounded border border-app-border-input px-2.5 py-1.5 text-sm text-app-fg hover:bg-app-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Limpar</span>
              </button>
              <button
                type="button"
                onClick={aoComparar}
                disabled={!podeComparar}
                title={
                  podeComparar
                    ? undefined
                    : 'Selecione pelo menos 2 estações para comparar'
                }
                className="inline-flex items-center gap-1.5 rounded bg-gov-azul px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-gov-azul-escuro disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
              >
                <BarChart3 className="h-4 w-4" aria-hidden="true" />
                Comparar
              </button>
            </div>
          </div>

          {/* Aviso de capacidade quando cheia. */}
          {cheia ? (
            <p className="text-xs text-amber-700">
              Limite de {maximo} estações atingido. Remova uma estação para
              adicionar outra.
            </p>
          ) : !podeComparar ? (
            <p className="text-xs text-app-fg-muted">
              Adicione pelo menos 2 estações para comparar.
            </p>
          ) : null}

          {/* Lista das estações: sempre visível no desktop; colapsável no mobile. */}
          <ul
            id="cesta-comparacao-lista"
            aria-label="Estações na cesta de comparação"
            className={[
              'flex-wrap gap-1.5',
              listaAberta ? 'flex' : 'hidden',
              'sm:flex',
            ].join(' ')}
          >
            {estacoes.map((e, indice) => (
              <li
                key={e.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-app-border-subtle bg-app-surface-2 py-1 pl-2.5 pr-1 text-xs text-app-fg"
              >
                <span
                  aria-hidden="true"
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-app-border-subtle"
                  style={{ backgroundColor: corComparacao(indice) }}
                />
                <span
                  className="max-w-[10rem] truncate"
                  title={e.nome || undefined}
                >
                  {rotuloEstacao(e)}
                </span>
                <button
                  type="button"
                  onClick={() => aoRemover(e.id)}
                  aria-label={`Remover ${rotuloEstacao(e)} da comparação`}
                  className="ml-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-app-fg-muted hover:bg-app-surface hover:text-gov-perigo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gov-azul"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <ConfirmDialog
        aberto={confirmandoLimpar}
        titulo="Limpar a comparação?"
        descricao={
          <>
            Isso remove todas as{' '}
            <strong>{total.toLocaleString('pt-BR')}</strong> estações da cesta de
            comparação. Você pode adicioná-las novamente depois.
          </>
        }
        rotuloConfirmar="Sim, limpar"
        rotuloCancelar="Cancelar"
        variante="perigo"
        aoConfirmar={() => {
          aoLimpar();
          setConfirmandoLimpar(false);
        }}
        aoCancelar={() => setConfirmandoLimpar(false)}
      />
    </>
  );
}
