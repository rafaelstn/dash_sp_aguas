'use client';

import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { NodeBarragem as TipoNodeBarragem } from '../tipos-editor';

/**
 * Barragem / barramento, no estilo SIBH/DAEE: estrutura robusta e sóbria
 * (cinza-escuro), desenhada como um bloco trapezoidal hachurado (linguagem de
 * prancha de engenharia), com o nome ao lado. Diferente do reservatório
 * (círculo azul) e dos postos (cards de leitura): a barragem é uma ESTRUTURA no
 * rio, então o vocabulário visual é de obra civil, não de medição.
 *
 * Sem valor medido nem status, apenas rótulo. Segue o padrão dos demais nodes:
 * grupo focável com `aria-label`, anel de seleção azul (gov-azul), tokens do
 * tema (cinza via --fg-*). Não usa Handle (o canvas é não conectável; as
 * relações são visuais, pelo posicionamento e pelos rios).
 *
 * A11y: o ícone é decorativo (aria-hidden); o nome carrega a informação no
 * texto e no aria-label do grupo. Cinza-escuro #4B5563 sobre branco = 7.5:1.
 */
function NodeBarragemBase({ data, selected }: NodeProps<TipoNodeBarragem>) {
  const { elemento } = data;

  return (
    <div
      role="group"
      aria-label={`Barragem ${elemento.nome}`}
      className="group flex items-center gap-2.5"
    >
      <span
        className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[4px] text-white shadow-gov-card transition-shadow duration-200 group-hover:shadow-gov-card-hover"
        style={{
          backgroundColor: 'hsl(var(--fg-muted))',
          boxShadow: selected
            ? '0 0 0 2px hsl(var(--gov-azul)), 0 0 0 4px white'
            : undefined,
        }}
      >
        <BarragemIcone />
      </span>
      <span className="max-w-[150px] rounded-md border border-app-border-subtle bg-white px-2 py-1 text-2xs font-medium leading-tight text-app-fg shadow-gov-card">
        {elemento.nome}
      </span>
    </div>
  );
}

/**
 * Ícone de barragem: bloco trapezoidal (corpo do barramento) com hachuras de
 * concreto e a lâmina d'água represada à montante, vocabulário de prancha
 * DAEE. Branco sobre o corpo cinza-escuro do node.
 */
function BarragemIcone() {
  return (
    <svg
      width={30}
      height={30}
      viewBox="0 0 30 30"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      {/* Lâmina d'água represada (à esquerda/montante), traços de superfície */}
      <path
        d="M3 12h6M3 15h6M3 18h6"
        stroke="white"
        strokeOpacity={0.55}
        strokeWidth={1.4}
        strokeLinecap="round"
      />
      {/* Corpo trapezoidal da barragem (mais largo na base) */}
      <path
        d="M11 8 L18 8 L23 23 L9 23 Z"
        fill="white"
        fillOpacity={0.12}
        stroke="white"
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      {/* Hachuras de concreto no corpo */}
      <path
        d="M12 12l6 9M14 10l5 12"
        stroke="white"
        strokeOpacity={0.7}
        strokeWidth={1.2}
        strokeLinecap="round"
      />
    </svg>
  );
}

export const NodeBarragem = memo(NodeBarragemBase);
