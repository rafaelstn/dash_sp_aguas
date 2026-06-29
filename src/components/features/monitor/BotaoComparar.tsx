'use client';

import { Plus, Check } from 'lucide-react';
import type { Estacao } from './tipos';

interface BotaoCompararProps {
  estacao: Estacao;
  /** A estação já está na cesta de comparação? */
  selecionada: boolean;
  /** Ainda cabe estação na cesta (relevante quando não selecionada). */
  podeAdicionar: boolean;
  /** Alterna a estação na cesta. */
  aoAlternar: (estacao: Estacao) => void;
  /** Variante visual: botão completo (detalhe) ou compacto (linha de lista). */
  tamanho?: 'completo' | 'compacto';
}

/** Rótulo curto da estação para os aria-labels. */
function rotuloEstacao(e: Estacao): string {
  return e.prefixo || e.nome || 'estação';
}

/**
 * Botão "Adicionar à comparação" / "Remover da comparação" reutilizável.
 *
 * Alterna o estado na cesta. Quando a estação já está selecionada, vira o estado
 * "na comparação" (cor de confirmação + ícone de check). Quando a cesta está
 * cheia e a estação não está nela, o botão fica desabilitado com explicação no
 * title (a cor nunca é a única pista: há ícone + texto + aria).
 */
export function BotaoComparar({
  estacao,
  selecionada,
  podeAdicionar,
  aoAlternar,
  tamanho = 'completo',
}: BotaoCompararProps) {
  const bloqueado = !selecionada && !podeAdicionar;
  const nome = rotuloEstacao(estacao);

  const rotulo = selecionada
    ? 'Na comparação'
    : tamanho === 'compacto'
      ? 'Comparar'
      : 'Adicionar à comparação';

  const ariaLabel = selecionada
    ? `Remover ${nome} da comparação`
    : `Adicionar ${nome} à comparação`;

  const dimensao =
    tamanho === 'compacto'
      ? 'px-2 py-1 text-xs'
      : 'px-2.5 py-1.5 text-sm';

  const cor = selecionada
    ? 'border-gov-sucesso bg-green-50 text-gov-sucesso hover:bg-green-100'
    : 'border-app-border-input text-gov-azul hover:bg-app-surface-2';

  return (
    <button
      type="button"
      onClick={() => aoAlternar(estacao)}
      disabled={bloqueado}
      aria-pressed={selecionada}
      aria-label={ariaLabel}
      title={
        bloqueado
          ? 'Cesta de comparação cheia. Remova uma estação para adicionar outra.'
          : undefined
      }
      className={[
        'inline-flex items-center gap-1.5 rounded border font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul',
        dimensao,
        cor,
      ].join(' ')}
    >
      {selecionada ? (
        <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      ) : (
        <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      )}
      {rotulo}
    </button>
  );
}
