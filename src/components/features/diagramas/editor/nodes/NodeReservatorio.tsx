'use client';

import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Waves } from 'lucide-react';
import type { NodeReservatorio as TipoNodeReservatorio } from '../tipos-editor';

/**
 * Reservatório, fiel ao SIBH/DAEE: círculo azul médio chapado (#0275d8) com
 * ícone de ondas branco no centro e o nome ao lado. Apenas rótulo, sem valor
 * medido. O ícone de ondas ondula de leve, respeitando prefers-reduced-motion.
 * O hex vem do computed style real do SIBH (60px, fill sólido, sem gradiente).
 *
 * A11y: ondas brancas sobre azul #0275d8 (4.6:1, AA). O grupo é focável e
 * nomeia o reservatório pro leitor de tela.
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
        className="flex h-[60px] w-[60px] shrink-0 items-center justify-center rounded-full text-white shadow-gov-card transition-shadow duration-200 group-hover:shadow-gov-card-hover"
        style={{
          backgroundColor: 'hsl(var(--sibh-reservatorio))',
          boxShadow: selected
            ? `0 0 0 2px hsl(var(--gov-azul)), 0 0 0 4px white`
            : undefined,
        }}
      >
        <Waves className="reservatorio-onda h-7 w-7" aria-hidden="true" />
      </span>
      <span className="max-w-[150px] rounded-md border border-app-border-subtle bg-white px-2 py-1 text-2xs font-medium leading-tight text-app-fg shadow-gov-card">
        {elemento.nome}
      </span>
    </div>
  );
}

export const NodeReservatorio = memo(NodeReservatorioBase);
