'use client';

import { AlertCircle, Loader2, RefreshCw, Radio } from 'lucide-react';
import type { EstadoAoVivo } from './useValoresAoVivo';

interface Props {
  estado: EstadoAoVivo;
  aoAlternar: () => void;
  aoAtualizar: () => void;
}

/**
 * Controle do modo "AGORA" (ao vivo) na faixa do editor: um toggle e, quando
 * ligado, o indicador de atualização e o botão Atualizar.
 *
 * A11y: o toggle é um `button` com `aria-pressed` refletindo o estado; o
 * indicador de atualização usa `aria-live="polite"` para anunciar carregando,
 * horário e erro sem roubar o foco. Ícone decorativo; o texto carrega a
 * informação. Erro do endpoint vira aviso (degradação graciosa).
 */
export function ControleAoVivo({ estado, aoAlternar, aoAtualizar }: Props) {
  const { ligado, fase, atualizadoEm } = estado;

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={aoAlternar}
        aria-pressed={ligado}
        aria-label="Modo ao vivo, mostrar os valores agora"
        title="Mostrar os valores agora (leitura ao vivo do SIBH)"
        className={[
          'inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition-colors',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
          ligado
            ? 'bg-white text-gov-azul shadow-sm'
            : 'text-white hover:bg-white/15',
        ].join(' ')}
      >
        <Radio className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{ligado ? 'Ao vivo' : 'Agora'}</span>
      </button>

      {ligado ? (
        <div className="flex items-center gap-2">
          <span
            role="status"
            aria-live="polite"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-white/90"
          >
            {fase === 'carregando' ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                Atualizando...
              </>
            ) : fase === 'erro' ? (
              <span className="inline-flex items-center gap-1.5 text-amber-200">
                <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                Erro ao atualizar
              </span>
            ) : atualizadoEm ? (
              <>Atualizado em {formatarHora(atualizadoEm)}</>
            ) : null}
          </span>

          <button
            type="button"
            onClick={aoAtualizar}
            disabled={fase === 'carregando'}
            aria-label="Atualizar os valores agora"
            title="Atualizar os valores"
            className="inline-flex items-center justify-center rounded-md p-1.5 text-white transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <RefreshCw className="h-4 w-4 shrink-0" aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Hora local no formato HH:MM (pt-BR). */
function formatarHora(d: Date): string {
  return d.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}
