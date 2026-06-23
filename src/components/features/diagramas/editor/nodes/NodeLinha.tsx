'use client';

import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useReactFlow, type NodeProps } from '@xyflow/react';
import type { ElementoLinha, Posicao } from '@/domain/diagramas/tipos';
import type { NodeLinha as TipoNodeLinha } from '../tipos-editor';

/**
 * Rio/trecho (padrão SIBH): faixa azul grossa desenhada em SVG a partir de
 * `pontos[]` absolutos, com rótulo do rio e seta de direção do fluxo conforme
 * `direcaoSeta` ('direta' = sentido dos pontos, 'reversa' = inverso, 'nenhuma'
 * = sem seta). O node fica em (0,0) no React Flow e usa um SVG do tamanho do
 * canvas com `overflow: visible`; assim o traçado não depende de transform do
 * node.
 *
 * Edição do traçado (Fase A3): quando o rio está selecionado, cada vértice
 * vira uma alça arrastável (`pointer events` + `screenToFlowPosition` para
 * converter tela -> canvas); um duplo clique no segmento insere um vértice no
 * ponto clicado; a alça mostra um botão para remover o vértice (mínimo 2). As
 * mutações chamam `data.acoes`, que o editor liga ao estado/auto-save/undo.
 * Durante o arrasto persiste=false (não grava cada pixel); ao soltar, true.
 *
 * Decisão node-vs-edge documentada em mapeamento.ts.
 */
function NodeLinhaBase({ id, data, selected }: NodeProps<TipoNodeLinha>) {
  const { elemento, acoes } = data;
  const { screenToFlowPosition } = useReactFlow();
  const arrastandoRef = useRef<number | null>(null);
  const [arrastando, setArrastando] = useState<number | null>(null);

  const pontos = elemento.pontos;

  const aoSoltarGlobal = useRef<((e: PointerEvent) => void) | null>(null);
  const aoMoverGlobal = useRef<((e: PointerEvent) => void) | null>(null);

  // Limpa listeners globais ao desmontar (defensivo).
  useEffect(() => {
    return () => {
      if (aoMoverGlobal.current)
        window.removeEventListener('pointermove', aoMoverGlobal.current);
      if (aoSoltarGlobal.current)
        window.removeEventListener('pointerup', aoSoltarGlobal.current);
    };
  }, []);

  const iniciarArrasto = useCallback(
    (indice: number, e: React.PointerEvent) => {
      if (!acoes) return;
      e.stopPropagation();
      e.preventDefault();
      arrastandoRef.current = indice;
      setArrastando(indice);

      const mover = (ev: PointerEvent) => {
        if (arrastandoRef.current === null) return;
        const ponto = screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
        acoes.moverPonto(id, arrastandoRef.current, ponto, false);
      };
      const soltar = (ev: PointerEvent) => {
        if (arrastandoRef.current !== null) {
          const ponto = screenToFlowPosition({ x: ev.clientX, y: ev.clientY });
          acoes.moverPonto(id, arrastandoRef.current, ponto, true);
        }
        arrastandoRef.current = null;
        setArrastando(null);
        window.removeEventListener('pointermove', mover);
        window.removeEventListener('pointerup', soltar);
        aoMoverGlobal.current = null;
        aoSoltarGlobal.current = null;
      };
      aoMoverGlobal.current = mover;
      aoSoltarGlobal.current = soltar;
      window.addEventListener('pointermove', mover);
      window.addEventListener('pointerup', soltar);
    },
    [acoes, id, screenToFlowPosition],
  );

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

  // Camadas da faixa (padrão SIBH refinado): margem clara, corpo azul e brilho
  // central, lidas como um leito d'água com volume em vez de um traço chapado.
  const corMargem = 'hsl(var(--gov-azul) / 0.18)';
  const corCorpo = 'hsl(var(--gov-azul) / 0.62)';
  const corBrilho = 'hsl(var(--gov-azul-claro) / 0.85)';
  const corTraco = 'hsl(var(--gov-azul))';

  // Sinal do fluxo: 'reversa' inverte o sentido da correnteza animada para
  // bater com a seta de direção. 'nenhuma' não anima (água parada).
  const temFluxo = elemento.direcaoSeta !== 'nenhuma';
  const direcaoFluxo = elemento.direcaoSeta === 'reversa' ? 'reverse' : 'normal';

  const editavel = selected && acoes !== undefined;
  const rotulo = elemento.label?.trim();
  const larguraRotulo = rotulo ? rotulo.length * 6.4 + 14 : 0;

  return (
    <svg
      className="pointer-events-none overflow-visible"
      width={1}
      height={1}
      aria-hidden="true"
    >
      {/* Alvo de clique generoso (transparente, mais largo). Duplo clique
          insere um vértice no segmento mais próximo do ponto clicado. */}
      <path
        d={pathData}
        fill="none"
        stroke="transparent"
        strokeWidth={24}
        strokeLinecap="round"
        className="pointer-events-auto cursor-pointer"
        onDoubleClick={(e) => {
          if (!editavel || !acoes) return;
          e.stopPropagation();
          const ponto = screenToFlowPosition({ x: e.clientX, y: e.clientY });
          const seg = segmentoMaisProximo(pontos, ponto);
          acoes.inserirPonto(id, seg, ponto);
        }}
      />

      {/* Realce de seleção */}
      {selected ? (
        <path
          d={pathData}
          fill="none"
          stroke={corTraco}
          strokeOpacity={0.22}
          strokeWidth={24}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}

      {/* Margem clara do leito (dá volume à faixa) */}
      <path
        d={pathData}
        fill="none"
        stroke={corMargem}
        strokeWidth={17}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Corpo azul do rio */}
      <path
        d={pathData}
        fill="none"
        stroke={corCorpo}
        strokeWidth={13}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Correnteza animada: traços claros deslizando no sentido do fluxo.
          A classe CSS respeita prefers-reduced-motion (some quando reduzido). */}
      {temFluxo ? (
        <path
          className="rio-correnteza"
          style={
            { '--fluxo-direcao': direcaoFluxo } as React.CSSProperties
          }
          d={pathData}
          fill="none"
          stroke={corBrilho}
          strokeWidth={5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}

      {/* Seta de direção do fluxo */}
      {temFluxo ? (
        <polygon
          points="0,-6 13,0 0,6"
          fill={corTraco}
          transform={`translate(${pontoSeta.x}, ${pontoSeta.y}) rotate(${anguloSeta})`}
        />
      ) : null}

      {/* Rótulo do rio: pílula clara para legibilidade sobre o canvas. */}
      {rotulo ? (
        <g transform={`translate(${meio.x}, ${meio.y - 15})`} className="select-none">
          <rect
            x={-larguraRotulo / 2}
            y={-9}
            width={larguraRotulo}
            height={16}
            rx={8}
            fill="hsl(var(--bg-surface))"
            stroke="hsl(var(--gov-azul) / 0.30)"
            strokeWidth={1}
          />
          <text
            x={0}
            y={3}
            fill={corTraco}
            fontSize={10.5}
            fontWeight={600}
            letterSpacing={0.2}
            textAnchor="middle"
          >
            {rotulo}
          </text>
        </g>
      ) : null}

      {/* Alças de edição dos vértices (só com o rio selecionado) */}
      {editavel
        ? pontos.map((p, i) => {
            const ativa = arrastando === i;
            const podeRemover = pontos.length > 2;
            return (
              <g key={i}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={ativa ? 8 : 6}
                  fill="white"
                  stroke={corTraco}
                  strokeWidth={2}
                  className="pointer-events-auto cursor-grab active:cursor-grabbing"
                  onPointerDown={(e) => iniciarArrasto(i, e)}
                />
                {/* Botão de remover vértice (X), deslocado da alça */}
                {podeRemover ? (
                  <g
                    transform={`translate(${p.x + 11}, ${p.y - 11})`}
                    className="pointer-events-auto cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation();
                      acoes?.removerPonto(id, i);
                    }}
                  >
                    <circle r={6} fill={corTraco} />
                    <path
                      d="M -2.5 -2.5 L 2.5 2.5 M 2.5 -2.5 L -2.5 2.5"
                      stroke="white"
                      strokeWidth={1.5}
                      strokeLinecap="round"
                    />
                  </g>
                ) : null}
              </g>
            );
          })
        : null}
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

/**
 * Índice do segmento (entre o ponto i e i+1) mais próximo de `alvo`. Usado para
 * decidir onde inserir um vértice ao dar duplo clique no traçado.
 */
function segmentoMaisProximo(pontos: Posicao[], alvo: Posicao): number {
  let melhor = 0;
  let menor = Infinity;
  for (let i = 0; i < pontos.length - 1; i += 1) {
    const d = distanciaAoSegmento(alvo, pontos[i]!, pontos[i + 1]!);
    if (d < menor) {
      menor = d;
      melhor = i;
    }
  }
  return melhor;
}

/** Distância de um ponto ao segmento [a,b]. */
function distanciaAoSegmento(p: Posicao, a: Posicao, b: Posicao): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const comprimento2 = dx * dx + dy * dy;
  if (comprimento2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / comprimento2;
  t = Math.max(0, Math.min(1, t));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.hypot(p.x - projX, p.y - projY);
}

export const NodeLinha = memo(NodeLinhaBase);
