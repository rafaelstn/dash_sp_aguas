'use client';

import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { CloudRain } from 'lucide-react';
import type { NodeChuva as TipoNodeChuva } from '../tipos-editor';

/**
 * Posto de chuva (padrão SIBH): caixa branca com ícone de chuva e código,
 * valor acumulado em destaque com unidade 'mm' e o rótulo "Chuva" embaixo.
 * Valor pluviométrico é informativo (sem status).
 */
function NodeChuvaBase({ data, selected }: NodeProps<TipoNodeChuva>) {
  const { elemento } = data;
  const temValor = elemento.valor !== null && elemento.valor !== undefined;
  const valorTexto = temValor
    ? elemento.valor!.toLocaleString('pt-BR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      })
    : '— —';

  const descricao =
    `Posto de chuva ${elemento.nome}, código ${elemento.codigo}. ` +
    (temValor ? `Acumulado ${valorTexto} milímetros.` : 'Sem leitura.');

  return (
    <div
      role="group"
      aria-label={descricao}
      className="w-[104px] rounded-md border bg-white p-2 shadow-gov-card transition-shadow"
      style={{
        borderColor: 'hsl(var(--border-default))',
        boxShadow: selected ? `0 0 0 2px hsl(var(--gov-azul))` : undefined,
      }}
    >
      <div className="mb-1 flex items-center justify-center gap-1">
        <CloudRain className="h-3.5 w-3.5 text-gov-azul" aria-hidden="true" />
        <span className="truncate font-mono text-2xs text-app-fg-muted">
          {elemento.codigo}
        </span>
      </div>

      <div className="flex items-baseline justify-center gap-1">
        <span className="tabular-nums text-lg font-semibold leading-none text-app-fg">
          {valorTexto}
        </span>
        <span className="text-2xs font-medium text-app-fg-muted">mm</span>
      </div>

      <div className="mt-1.5 border-t border-app-border-subtle pt-1 text-center">
        <span className="block text-2xs text-app-fg-muted">Chuva</span>
      </div>
    </div>
  );
}

export const NodeChuva = memo(NodeChuvaBase);
