'use client';

import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { EstadoComporta } from '@/domain/diagramas/tipos';
import type { NodeComporta as TipoNodeComporta } from '../tipos-editor';

/**
 * Comporta / estrutura de controle de vazão, no estilo SIBH/DAEE. Estrutura
 * sóbria que comunica claramente o ESTADO (aberta / fechada / parcial) por
 * TRÊS canais redundantes, para nunca depender só de cor (e-MAG/WCAG):
 *   1. ícone: comporta fechada = lâmina cheia; aberta = lâmina vazada (recolhida)
 *      com fluxo passando; parcial = lâmina meio aberta com fluxo reduzido;
 *   2. cor (token de status): fechada vermelho, aberta verde, parcial âmbar;
 *   3. rótulo textual do estado, sempre visível abaixo do nome.
 *
 * Segue o padrão dos demais nodes: grupo focável com `aria-label` que inclui o
 * estado por extenso, anel de seleção azul, tokens do tema. Sem Handle (canvas
 * não conectável). Sem valor medido.
 */
function NodeComportaBase({ data, selected }: NodeProps<TipoNodeComporta>) {
  const { elemento } = data;
  const visual = ESTADO_VISUAL[elemento.estado];

  return (
    <div
      role="group"
      aria-label={`Comporta ${elemento.nome}, ${visual.rotulo}`}
      className="group flex items-center gap-2.5"
    >
      <span
        className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[4px] text-white shadow-gov-card transition-shadow duration-200 group-hover:shadow-gov-card-hover"
        style={{
          backgroundColor: `hsl(var(${visual.token}))`,
          boxShadow: selected
            ? '0 0 0 2px hsl(var(--gov-azul)), 0 0 0 4px white'
            : undefined,
        }}
      >
        <ComportaIcone estado={elemento.estado} />
      </span>

      <span className="flex max-w-[160px] flex-col gap-0.5 rounded-md border border-app-border-subtle bg-white px-2 py-1 leading-tight shadow-gov-card">
        <span className="text-2xs font-medium text-app-fg">{elemento.nome}</span>
        <span
          className="text-2xs font-semibold"
          style={{ color: `hsl(var(${visual.token}))` }}
        >
          {visual.rotulo}
        </span>
      </span>
    </div>
  );
}

/** Token de cor e rótulo textual de cada estado (cor nunca é o único canal). */
const ESTADO_VISUAL: Record<
  EstadoComporta,
  { token: string; rotulo: string }
> = {
  aberta: { token: '--status-success', rotulo: 'Aberta' },
  fechada: { token: '--status-danger', rotulo: 'Fechada' },
  parcial: { token: '--status-warn', rotulo: 'Parcial' },
};

/**
 * Ícone da comporta conforme o estado. Moldura fixa (a estrutura) e a lâmina
 * que sobe/desce: fechada = lâmina cobrindo o vão; parcial = lâmina a meia
 * altura, deixando fluxo embaixo; aberta = lâmina recolhida no topo, vão livre.
 * O fluxo é representado por setas horizontais quando há passagem.
 */
function ComportaIcone({ estado }: { estado: EstadoComporta }) {
  // Altura da lâmina (a partir do topo do vão, y=7..23 = vão de 16px):
  // fechada cobre tudo; parcial cobre metade; aberta quase nada (recolhida).
  const alturaLamina = estado === 'fechada' ? 16 : estado === 'parcial' ? 8 : 3;
  const temFluxo = estado !== 'fechada';

  return (
    <svg
      width={30}
      height={30}
      viewBox="0 0 30 30"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      {/* Montantes laterais da estrutura (guias da comporta) */}
      <path
        d="M8 5v20M22 5v20"
        stroke="white"
        strokeWidth={2}
        strokeLinecap="round"
      />
      {/* Vão (contorno) */}
      <rect
        x={8}
        y={7}
        width={14}
        height={16}
        stroke="white"
        strokeOpacity={0.5}
        strokeWidth={1}
        rx={1}
      />
      {/* Lâmina da comporta (preenchida), altura conforme o estado */}
      <rect
        x={8}
        y={7}
        width={14}
        height={alturaLamina}
        fill="white"
        fillOpacity={0.92}
        rx={1}
      />
      {/* Fluxo passando por baixo da lâmina (quando aberta/parcial) */}
      {temFluxo ? (
        <path
          d="M10 27h10"
          stroke="white"
          strokeWidth={1.6}
          strokeLinecap="round"
        />
      ) : null}
    </svg>
  );
}

export const NodeComporta = memo(NodeComportaBase);
