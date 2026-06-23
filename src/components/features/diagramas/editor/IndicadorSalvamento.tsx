'use client';

import { AlertCircle, Check, Loader2 } from 'lucide-react';

export type EstadoSalvamento = 'ocioso' | 'salvando' | 'salvo' | 'erro';

interface Props {
  estado: EstadoSalvamento;
}

/**
 * Indicador de auto-save na barra do editor. Em estado ocioso não renderiza
 * nada. `aria-live="polite"` para o leitor de tela anunciar a mudança sem
 * roubar o foco; ícone é decorativo, o texto carrega a informação.
 */
export function IndicadorSalvamento({ estado }: Props) {
  if (estado === 'ocioso') return null;

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
    erro: {
      icone: <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />,
      texto: 'Erro ao salvar',
      classe: 'text-amber-200',
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
