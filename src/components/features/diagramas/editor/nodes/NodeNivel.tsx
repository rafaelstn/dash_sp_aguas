'use client';

import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import {
  STATUS_COLORS,
  STATUS_LABELS,
  calcularStatus,
} from '@/domain/diagramas/tipos';
import type { NodeNivel as TipoNodeNivel } from '../tipos-editor';

/**
 * Posto de nível (padrão SIBH): caixa branca com código no topo, valor em
 * destaque, seta de tendência, unidade e badge circular de status pintado com
 * a cor do domínio (`calcularStatus` + `STATUS_COLORS`). Min/max aparecem
 * quando há limiares. Em atenção+ ganha leve realce na borda.
 *
 * A11y: o badge tem `title` + texto oculto com o nome do status (leitor de
 * tela não depende de cor). O node inteiro é focável e descreve o posto.
 */
function NodeNivelBase({ data, selected }: NodeProps<TipoNodeNivel>) {
  const { elemento } = data;
  const status = calcularStatus(elemento.valor, elemento.limiares);
  const cor = STATUS_COLORS[status];
  const rotuloStatus = STATUS_LABELS[status];
  const unidade = elemento.unidade ?? '';

  const temValor = elemento.valor !== null && elemento.valor !== undefined;
  const valorTexto = temValor
    ? elemento.valor!.toLocaleString('pt-BR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 3,
      })
    : '— — —';

  const min = elemento.limiares.atencao ?? null;
  const max =
    elemento.limiares.extravasamento ??
    elemento.limiares.emergencia ??
    null;
  const temFaixa = min !== null || max !== null;

  const realce = status !== 'normal';

  const descricao =
    `Posto de nível ${elemento.nome}, código ${elemento.codigo}. ` +
    (temValor ? `Valor ${valorTexto} ${unidade}. ` : 'Sem leitura. ') +
    `Status ${rotuloStatus}.`;

  return (
    <div
      role="group"
      aria-label={descricao}
      className="w-[136px] rounded-md border bg-white p-2 shadow-gov-card transition-shadow"
      style={{
        borderColor: realce ? cor : 'hsl(var(--border-default))',
        boxShadow: selected ? `0 0 0 2px hsl(var(--gov-azul))` : undefined,
      }}
    >
      {/* Cabeçalho: código + badge de status */}
      <div className="mb-1 flex items-center justify-between gap-1">
        <span className="truncate font-mono text-2xs text-app-fg-muted">
          {elemento.codigo}
        </span>
        <span
          className="inline-flex h-3 w-3 shrink-0 rounded-full"
          style={{ backgroundColor: cor }}
          title={rotuloStatus}
          aria-hidden="true"
        />
        <span className="sr-only">Status: {rotuloStatus}</span>
      </div>

      {/* Valor + tendência + unidade */}
      <div className="flex items-baseline justify-center gap-1">
        <TendenciaIcone />
        <span className="tabular-nums text-lg font-semibold leading-none text-app-fg">
          {valorTexto}
        </span>
        {unidade ? (
          <span className="text-2xs font-medium text-app-fg-muted">
            {unidade}
          </span>
        ) : null}
      </div>

      {/* Min/Max quando há limiares */}
      {temFaixa ? (
        <div className="mt-1.5 flex items-center justify-between text-2xs text-app-fg-subtle">
          <span className="inline-flex items-center gap-0.5">
            <ArrowDown className="h-3 w-3" aria-hidden="true" />
            <span className="tabular-nums">
              {min !== null ? min.toLocaleString('pt-BR') : '—'}
            </span>
          </span>
          <span className="inline-flex items-center gap-0.5">
            <ArrowUp className="h-3 w-3" aria-hidden="true" />
            <span className="tabular-nums">
              {max !== null ? max.toLocaleString('pt-BR') : '—'}
            </span>
          </span>
        </div>
      ) : null}

      {/* Nome */}
      <div className="mt-1.5 border-t border-app-border-subtle pt-1 text-center">
        <span className="block truncate text-2xs text-app-fg-muted">
          {elemento.nome}
        </span>
      </div>
    </div>
  );
}

/**
 * Tendência: nesta fase não há série temporal (vem na A5 com o catálogo).
 * Mostra "estável" como neutro, sem inventar direção. O ícone é decorativo;
 * a informação real (valor/status) está no texto.
 */
function TendenciaIcone() {
  return <Minus className="h-3.5 w-3.5 text-app-fg-subtle" aria-hidden="true" />;
}

export const NodeNivel = memo(NodeNivelBase);
