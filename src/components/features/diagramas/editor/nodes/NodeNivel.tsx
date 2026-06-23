'use client';

import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { Minus, TriangleAlert } from 'lucide-react';
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
 * quando há limiares. Em atenção+ ganha realce na borda e uma faixa de status
 * no rodapé; em alerta+ o realce pulsa de leve para chamar o olho.
 *
 * A11y: o badge tem `title` + texto oculto com o nome do status (leitor de
 * tela não depende de cor). O node inteiro é focável e descreve o posto.
 * O pulso respeita prefers-reduced-motion (vira opacidade estática).
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
  const critico =
    status === 'alerta' ||
    status === 'emergencia' ||
    status === 'extravasamento';

  const descricao =
    `Posto de nível ${elemento.nome}, código ${elemento.codigo}. ` +
    (temValor ? `Valor ${valorTexto} ${unidade}. ` : 'Sem leitura. ') +
    `Status ${rotuloStatus}.`;

  return (
    <div
      role="group"
      aria-label={descricao}
      className="group relative w-[148px] rounded-lg border bg-white shadow-gov-card transition-shadow duration-200 hover:shadow-gov-card-hover"
      style={{
        borderColor: realce ? cor : 'hsl(var(--border-default))',
        boxShadow: selected
          ? `0 0 0 2px hsl(var(--gov-azul)), 0 1px 3px rgba(17,24,39,0.10)`
          : undefined,
      }}
    >
      {/* Faixa de status no topo da caixa (fina, só quando há alarme) */}
      {realce ? (
        <span
          className={[
            'absolute inset-x-0 top-0 h-1 rounded-t-lg',
            critico ? 'posto-pulso' : '',
          ].join(' ')}
          style={{ backgroundColor: cor }}
          aria-hidden="true"
        />
      ) : null}

      <div className="p-2.5">
        {/* Cabeçalho: código + badge de status */}
        <div className="mb-1.5 flex items-center justify-between gap-1.5">
          <span className="truncate font-mono text-2xs tracking-tight text-app-fg-muted">
            {elemento.codigo}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1">
            {critico ? (
              <TriangleAlert
                className="h-3 w-3"
                style={{ color: cor }}
                aria-hidden="true"
              />
            ) : null}
            <span
              className="inline-flex h-3 w-3 rounded-full ring-2 ring-white"
              style={{ backgroundColor: cor }}
              title={rotuloStatus}
              aria-hidden="true"
            />
          </span>
          <span className="sr-only">Status: {rotuloStatus}</span>
        </div>

        {/* Valor + tendência + unidade */}
        <div className="flex items-baseline justify-center gap-1">
          <TendenciaIcone />
          <span className="tabular-nums text-xl font-semibold leading-none tracking-tight text-app-fg">
            {valorTexto}
          </span>
          {unidade ? (
            <span className="text-2xs font-medium text-app-fg-muted">
              {unidade}
            </span>
          ) : null}
        </div>

        {/* Min/Max quando há limiares (triângulos baixo/cima, padrão SIBH) */}
        {temFaixa ? (
          <div className="mt-2 flex items-center justify-between rounded bg-app-surface-2 px-1.5 py-1 text-2xs text-app-fg-subtle">
            <span className="inline-flex items-center gap-1">
              <Triangulo direcao="baixo" />
              <span className="tabular-nums">
                {min !== null ? min.toLocaleString('pt-BR') : '—'}
              </span>
            </span>
            <span className="inline-flex items-center gap-1">
              <Triangulo direcao="cima" />
              <span className="tabular-nums">
                {max !== null ? max.toLocaleString('pt-BR') : '—'}
              </span>
            </span>
          </div>
        ) : null}

        {/* Nome */}
        <div className="mt-2 border-t border-app-border-subtle pt-1.5 text-center">
          <span className="block truncate text-2xs font-medium text-app-fg-muted">
            {elemento.nome}
          </span>
        </div>

        {/* Etiqueta textual de status em alarme (não depende de cor) */}
        {realce ? (
          <div className="mt-1 text-center">
            <span
              className="inline-block rounded-full px-2 py-px text-2xs font-semibold uppercase tracking-wide text-white"
              style={{ backgroundColor: cor }}
            >
              {rotuloStatus}
            </span>
          </div>
        ) : null}
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

/** Triângulo cheio (baixo = mínimo, cima = máximo) no padrão da legenda SIBH. */
function Triangulo({ direcao }: { direcao: 'cima' | 'baixo' }) {
  const pontos = direcao === 'cima' ? '5,1.5 9,8 1,8' : '1,2 9,2 5,8.5';
  return (
    <svg
      width={10}
      height={10}
      viewBox="0 0 10 10"
      className="shrink-0"
      aria-hidden="true"
    >
      <polygon points={pontos} fill="currentColor" />
    </svg>
  );
}

export const NodeNivel = memo(NodeNivelBase);
