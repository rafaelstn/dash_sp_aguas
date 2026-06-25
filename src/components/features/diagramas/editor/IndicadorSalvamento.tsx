'use client';

import { AlertCircle, Check, Loader2 } from 'lucide-react';

export type EstadoSalvamento = 'ocioso' | 'salvando' | 'salvo' | 'erro';

interface Props {
  estado: EstadoSalvamento;
  /** Dispara o reenvio manual; quando ausente, o estado de erro não mostra retry. */
  aoTentarNovamente?: () => void;
}

/**
 * Indicador de auto-save na barra do editor. Em estado ocioso não renderiza
 * nada. `aria-live="polite"` para o leitor de tela anunciar a mudança sem
 * roubar o foco; ícone é decorativo, o texto carrega a informação. Em erro,
 * oferece um botão visível de "Tentar novamente" (o salvamento não fica preso
 * dependendo de uma nova edição do usuário).
 */
export function IndicadorSalvamento({ estado, aoTentarNovamente }: Props) {
  if (estado === 'ocioso') return null;

  if (estado === 'erro') {
    return (
      <span
        role="status"
        aria-live="polite"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-200"
      >
        <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
        Erro ao salvar
        {aoTentarNovamente ? (
          <button
            type="button"
            onClick={aoTentarNovamente}
            className="ml-1 rounded px-1.5 py-0.5 font-semibold text-white underline underline-offset-2 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            Tentar novamente
          </button>
        ) : null}
      </span>
    );
  }

  const conteudo = {
    salvando: {
      icone: <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />,
      texto: 'Salvando…',
      classe: 'text-white/90',
    },
    salvo: {
      icone: <Check className="h-3.5 w-3.5" aria-hidden="true" />,
      texto: 'Salvo',
      classe: 'text-white',
    },
  }[estado];

  return (
    <span
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-1.5 text-xs font-medium ${conteudo.classe}`}
    >
      {conteudo.icone}
      {conteudo.texto}
    </span>
  );
}
