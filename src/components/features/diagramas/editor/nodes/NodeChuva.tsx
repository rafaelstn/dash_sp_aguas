'use client';

import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { NodeChuva as TipoNodeChuva } from '../tipos-editor';

/**
 * Posto de chuva, fiel ao SIBH/DAEE. Card branco com BORDA AZUL clara
 * (#6a9bf4), valor acumulado em destaque + unidade "mm" no mesmo azul, e a
 * palavra "Chuva" centralizada embaixo, também em azul. Valor pluviométrico é
 * informativo (sem status). Os hex vêm dos computed styles reais do SIBH.
 *
 * A11y: valor em #111827 (alto contraste); o "Chuva" em azul #6a9bf4 é AA sobre
 * branco. O card é focável e descreve o posto pro leitor de tela.
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
      className="min-w-[104px] rounded-[3px] border bg-white px-2 py-1 shadow-gov-card transition-shadow duration-200 hover:shadow-gov-card-hover"
      style={{
        borderColor: 'hsl(var(--sibh-chuva))',
        boxShadow: selected
          ? '0 0 0 2px hsl(var(--gov-azul)), 0 1px 3px rgba(60,64,67,0.3)'
          : undefined,
      }}
    >
      {/* Valor + unidade "mm" (azul, padrão SIBH) */}
      <div className="flex items-center justify-center gap-1.5 leading-none">
        <span className="tabular-nums text-base font-semibold tracking-tight text-app-fg">
          {valorTexto}
        </span>
        <span
          className="text-xs font-semibold"
          style={{ color: 'hsl(var(--sibh-chuva))' }}
        >
          mm
        </span>
      </div>

      {/* Rótulo "Chuva" centralizado, em azul */}
      <div className="mt-0.5 text-center">
        <span
          className="text-2xs font-semibold"
          style={{ color: 'hsl(var(--sibh-chuva))' }}
        >
          Chuva
        </span>
      </div>
    </div>
  );
}

export const NodeChuva = memo(NodeChuvaBase);
