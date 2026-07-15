'use client';

import { useRef, type KeyboardEvent } from 'react';
import { ROTULO_TIPO_HIDROLOGICO, type TipoHidrologico } from './tipos';

const OPCOES: readonly TipoHidrologico[] = [
  'pluviometrico',
  'fluviometrico',
  'piezometrico',
];

interface SeletorTipoHidrologicoProps {
  valor: TipoHidrologico;
  aoMudar: (valor: TipoHidrologico) => void;
  /** Rótulo acessível do grupo (nomeia o radiogroup pro leitor de tela). */
  rotulo?: string;
}

/**
 * Seletor de tipo hidrológico: Pluviométrico | Fluviométrico | Piezométrico.
 * Sempre há um tipo ativo (o dataset é filtrado por um tipo por vez).
 *
 * Acessibilidade (e-MAG / WCAG 4.1.2, 2.1.1): implementa o padrão ARIA de
 * radiogroup com roving tabindex. Só a opção ativa entra na ordem de tabulação
 * (tabIndex 0); as setas (esquerda/direita/cima/baixo, Home/End) movem e já
 * selecionam, como num grupo de rádios nativo. O estado ativo é comunicado por
 * aria-checked (semântica) E por preenchimento sólido gov-azul com texto branco
 * (WCAG 1.4.1: não diferencia apenas por cor). Foco visível em gov-azul.
 *
 * Responsivo: centralizado, quebra em pills sem estourar a largura no mobile.
 */
export function SeletorTipoHidrologico({
  valor,
  aoMudar,
  rotulo = 'Tipo de estação',
}: SeletorTipoHidrologicoProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  function aoTeclar(evento: KeyboardEvent<HTMLButtonElement>, indice: number) {
    let proximo: number;
    switch (evento.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        proximo = (indice + 1) % OPCOES.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        proximo = (indice - 1 + OPCOES.length) % OPCOES.length;
        break;
      case 'Home':
        proximo = 0;
        break;
      case 'End':
        proximo = OPCOES.length - 1;
        break;
      default:
        return;
    }
    const alvo = OPCOES[proximo];
    if (!alvo) return;
    evento.preventDefault();
    aoMudar(alvo);
    refs.current[proximo]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={rotulo}
      className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2"
    >
      {OPCOES.map((opcao, indice) => {
        const ativo = opcao === valor;
        return (
          <button
            key={opcao}
            ref={(el) => {
              refs.current[indice] = el;
            }}
            type="button"
            role="radio"
            aria-checked={ativo}
            tabIndex={ativo ? 0 : -1}
            onClick={() => aoMudar(opcao)}
            onKeyDown={(evento) => aoTeclar(evento, indice)}
            className={[
              'rounded-full px-4 py-2 text-sm font-semibold transition-colors',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul',
              ativo
                ? 'bg-gov-azul text-white shadow-gov-card'
                : 'text-app-fg-muted hover:bg-app-surface-2 hover:text-app-fg',
            ].join(' ')}
          >
            {ROTULO_TIPO_HIDROLOGICO[opcao]}
          </button>
        );
      })}
    </div>
  );
}
