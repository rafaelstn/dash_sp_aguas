'use client';

import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Waves } from 'lucide-react';
import type { NodeReservatorio as TipoNodeReservatorio } from '../tipos-editor';

/**
 * Reservatório (padrão SIBH): círculo azul preenchido com ícone de ondas
 * branco no centro e o nome ao lado. Apenas rótulo, sem valor medido.
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
      className="flex items-center gap-2"
    >
      <span
        className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gov-azul text-white shadow-gov-card"
        style={{
          boxShadow: selected
            ? `0 0 0 2px hsl(var(--gov-azul)), 0 0 0 4px white`
            : undefined,
        }}
      >
        <Waves className="h-6 w-6" aria-hidden="true" />
      </span>
      <span className="max-w-[140px] rounded border border-app-border-subtle bg-white px-2 py-1 text-2xs font-medium text-app-fg shadow-gov-card">
        {elemento.nome}
      </span>
    </div>
  );
}

export const NodeReservatorio = memo(NodeReservatorioBase);
