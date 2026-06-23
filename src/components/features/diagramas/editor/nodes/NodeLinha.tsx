'use client';

import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import type { ElementoLinha, Posicao } from '@/domain/diagramas/tipos';
import type { NodeLinha as TipoNodeLinha } from '../tipos-editor';

/**
 * Rio/trecho (padrão SIBH): faixa azul grossa desenhada em SVG a partir de
 * `pontos[]` absolutos, com rótulo do rio e seta de direção do fluxo conforme
 * `direcaoSeta` ('direta' = sentido dos pontos, 'reversa' = inverso, 'nenhuma'
 * = sem seta). O node fica em (0,0) no React Flow e usa um SVG do tamanho do
 * canvas com `overflow: visible`; assim o traçado não depende de transform do
 * node. Clicável para selecionar (faixa transparente larga = alvo generoso).
 *
 * Decisão node-vs-edge documentada em mapeamento.ts.
 */
function NodeLinhaBase({ data, selected }: NodeProps<TipoNodeLinha>) {
  const { elemento } = data;
  const pontos = elemento.pontos;
  const primeiro = pontos[0];
  const ultimo = pontos[pontos.length - 1];
  const penultimo = pontos[pontos.length - 2];
  if (pontos.length < 2 || !primeiro || !ultimo || !penultimo) return null;

  const pathData = pontos
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ');

  const { ponto: pontoSeta, angulo: anguloSeta } = calcularSeta(
    primeiro,
    ultimo,
    penultimo,
    elemento.direcaoSeta,
  );

  const meioIdx = Math.floor((pontos.length - 1) / 2);
  const a = pontos[meioIdx] ?? primeiro;
  const b = pontos[meioIdx + 1] ?? a;
  const meio = pontoMedio(a, b);
  const corFaixa = 'hsl(var(--gov-azul) / 0.55)';
  const corTraco = 'hsl(var(--gov-azul))';

  return (
    <svg
      className="pointer-events-none overflow-visible"
      width={1}
      height={1}
      aria-hidden="true"
    >
      {/* Alvo de clique generoso (transparente, mais largo) */}
      <path
        d={pathData}
        fill="none"
        stroke="transparent"
        strokeWidth={22}
        strokeLinecap="round"
        className="pointer-events-auto cursor-pointer"
      />

      {/* Realce de seleção */}
      {selected ? (
        <path
          d={pathData}
          fill="none"
          stroke={corTraco}
          strokeOpacity={0.25}
          strokeWidth={22}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}

      {/* Faixa do rio */}
      <path
        d={pathData}
        fill="none"
        stroke={corFaixa}
        strokeWidth={14}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Seta de direção do fluxo */}
      {elemento.direcaoSeta !== 'nenhuma' ? (
        <polygon
          points="0,-7 14,0 0,7"
          fill={corTraco}
          transform={`translate(${pontoSeta.x}, ${pontoSeta.y}) rotate(${anguloSeta})`}
        />
      ) : null}

      {/* Rótulo do rio */}
      {elemento.label ? (
        <text
          x={meio.x}
          y={meio.y - 12}
          fill={corTraco}
          fontSize={11}
          fontWeight={600}
          textAnchor="middle"
          className="select-none"
        >
          {elemento.label}
        </text>
      ) : null}
    </svg>
  );
}

/** Ângulo (graus) de p1 para p2. */
function angulo(p1: Posicao, p2: Posicao): number {
  return (Math.atan2(p2.y - p1.y, p2.x - p1.x) * 180) / Math.PI;
}

/**
 * Posição e rotação da ponta da seta conforme a direção do fluxo. Recebe os
 * pontos já garantidos com 2+ itens (o componente retorna antes nesse caso).
 */
function calcularSeta(
  primeiro: Posicao,
  ultimo: Posicao,
  penultimo: Posicao,
  direcao: ElementoLinha['direcaoSeta'],
): { ponto: Posicao; angulo: number } {
  if (direcao === 'reversa') {
    const segundo = penultimo;
    return { ponto: primeiro, angulo: angulo(segundo, primeiro) };
  }
  return { ponto: ultimo, angulo: angulo(penultimo, ultimo) };
}

/** Ponto médio do traçado (para posicionar o rótulo). */
function pontoMedio(a: Posicao, b: Posicao): Posicao {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export const NodeLinha = memo(NodeLinhaBase);
