'use client';

import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Waves } from 'lucide-react';
import type { NodeReservatorio as TipoNodeReservatorio } from '../tipos-editor';

/**
 * Reservatório (padrão SIBH): círculo azul preenchido com ícone de ondas
 * branco no centro e o nome ao lado. Apenas rótulo, sem valor medido. O ícone
 * de ondas ondula de leve (shimmer), respeitando prefers-reduced-motion.
 */
function NodeReservatorioBase({
  data,
  selected,
}: NodeProps<TipoNodeReservatorio>) {
  const { elemento } = data;

  return (
    <div
      role="group"
      aria-label={`Reservatório ${elemento.nome}`}
      className="group flex items-center gap-2.5"
    >
      <span
        className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full text-white shadow-gov-card transition-shadow duration-200 group-hover:shadow-gov-card-hover"
        style={{
          background:
            'radial-gradient(120% 120% at 30% 25%, hsl(var(--gov-azul) / 0.92), hsl(var(--gov-azul-escuro)))',
          boxShadow: selected
            ? `0 0 0 2px hsl(var(--gov-azul)), 0 0 0 4px white`
            : undefined,
        }}
      >
        {/* Brilho superior, dá volume à esfera d'água */}
        <span
          className="pointer-events-none absolute inset-x-2 top-1.5 h-3 rounded-full bg-white/25 blur-[2px]"
          aria-hidden="true"
        />
        <Waves className="reservatorio-onda h-6 w-6" aria-hidden="true" />
      </span>
      <span className="max-w-[150px] rounded-md border border-app-border-subtle bg-white px-2 py-1 text-2xs font-medium leading-tight text-app-fg shadow-gov-card">
        {elemento.nome}
      </span>
    </div>
  );
}

export const NodeReservatorio = memo(NodeReservatorioBase);
