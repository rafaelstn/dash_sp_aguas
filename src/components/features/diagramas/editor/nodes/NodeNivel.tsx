'use client';

import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import {
  STATUS_LABELS,
  calcularStatus,
  type StatusNivel,
} from '@/domain/diagramas/tipos';
import type { NodeNivel as TipoNodeNivel } from '../tipos-editor';

/**
 * Posto de nível, fiel ao SIBH/DAEE. Card retangular compacto cujo FUNDO muda
 * por status (branco / amarelo claro / laranja claro / vermelho), com borda
 * saturada da mesma família e sombra Material leve, exatamente como o site
 * oficial. Linha principal: valor grande preto + seta de tendência (rosa #f74f78)
 * + unidade "m" num tom verde água (#16c995). Linha de baixo, menor e cinza:
 * "˅ mínimo   ˄ máximo" (chevrons baixo/cima). Os hex vêm dos computed styles
 * reais do cth.daee.sp.gov.br/sibh.
 *
 * A11y (e-MAG/WCAG): o texto do valor é #111827 sobre fundos pastel (>= 12:1).
 * O status nunca depende só de cor: vai no `aria-label` do grupo e num texto
 * oculto. O card é focável e descreve o posto inteiro. A faixa em alerta+ pulsa
 * de leve, respeitando prefers-reduced-motion (vira opacidade estática).
 */
function NodeNivelBase({ data, selected }: NodeProps<TipoNodeNivel>) {
  const { elemento, overlay } = data;
  const unidade = elemento.unidade ?? 'm';
  const aoVivo = overlay?.aoVivo === true;
  // No modo ao vivo, o vínculo ausente é `undefined`; sem leitura recente é null.
  const semVinculo = aoVivo && overlay?.leitura === undefined;
  const leitura = overlay?.leitura ?? null;

  // Valor exibido: ao vivo usa a leitura (nível em metros); senão, o salvo.
  const valorExibido = aoVivo
    ? (leitura?.valorNivel ?? null)
    : elemento.valor;
  const temValor = valorExibido !== null && valorExibido !== undefined;

  const status = calcularStatus(valorExibido, elemento.limiares);
  const rotuloStatus = STATUS_LABELS[status];
  const paleta = CARD_STATUS[status];

  const valorTexto = temValor
    ? valorExibido!.toLocaleString('pt-BR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 3,
      })
    : '— — —';

  const min = elemento.limiares.atencao ?? null;
  const max =
    elemento.limiares.extravasamento ?? elemento.limiares.emergencia ?? null;
  const temFaixa = min !== null || max !== null;

  const critico =
    status === 'alerta' ||
    status === 'emergencia' ||
    status === 'extravasamento';

  const descricao =
    `Posto de nível ${elemento.nome}, código ${elemento.codigo}. ` +
    (semVinculo
      ? 'Sem posto vinculado. '
      : temValor
        ? `Valor ${valorTexto} ${unidade}${aoVivo && leitura ? `, lido em ${leitura.momento}` : ''}. `
        : 'Sem leitura. ') +
    `Status ${rotuloStatus}.`;

  return (
    <div
      role="group"
      aria-label={descricao}
      className={[
        'relative min-w-[112px] rounded-[3px] border bg-white px-2 py-1 shadow-gov-card',
        'transition-shadow duration-200 hover:shadow-gov-card-hover',
        critico ? 'posto-pulso' : '',
      ].join(' ')}
      style={{
        backgroundColor: `hsl(var(${paleta.fundo}))`,
        borderColor: `hsl(var(${paleta.borda}))`,
        boxShadow: selected
          ? '0 0 0 2px hsl(var(--gov-azul)), 0 1px 3px rgba(60,64,67,0.3)'
          : undefined,
      }}
    >
      {/* Linha principal: valor + seta de tendência + unidade "m" */}
      <div className="flex items-center justify-center gap-1.5 leading-none">
        <span className="tabular-nums text-base font-semibold tracking-tight text-app-fg">
          {valorTexto}
        </span>
        <SetaTendencia />
        <span
          className="text-xs font-semibold"
          style={{ color: 'hsl(var(--sibh-unidade-nivel))' }}
        >
          {unidade}
        </span>
      </div>

      {/* Linha mínimo/máximo (padrão SIBH: chevron baixo = mín, cima = máx) */}
      {temFaixa ? (
        <div className="mt-0.5 flex items-center justify-center gap-2.5 text-2xs text-app-fg-subtle">
          <span className="inline-flex items-center gap-0.5">
            <Chevron direcao="baixo" />
            <span className="tabular-nums">
              {min !== null ? min.toLocaleString('pt-BR') : '—'}
            </span>
          </span>
          <span className="inline-flex items-center gap-0.5">
            <Chevron direcao="cima" />
            <span className="tabular-nums">
              {max !== null ? max.toLocaleString('pt-BR') : '—'}
            </span>
          </span>
        </div>
      ) : null}

      {/* Modo ao vivo: momento da leitura, ou aviso de elemento sem vínculo. */}
      {aoVivo ? (
        <div className="mt-0.5 text-center">
          {semVinculo ? (
            <span className="text-2xs font-medium text-app-fg-subtle">
              Sem posto vinculado
            </span>
          ) : leitura ? (
            <span className="text-2xs text-app-fg-muted">
              {formatarMomento(leitura.momento)}
            </span>
          ) : (
            <span className="text-2xs font-medium text-app-fg-subtle">
              Sem leitura
            </span>
          )}
        </div>
      ) : null}

      <span className="sr-only">Status: {rotuloStatus}</span>
    </div>
  );
}

/**
 * Momento da leitura "YYYY/MM/DD HH:mm" do SIBH para um formato curto pt-BR
 * (DD/MM HH:mm). Se vier em formato inesperado, devolve o texto original.
 */
function formatarMomento(momento: string): string {
  const m = momento.match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}:\d{2})$/);
  if (!m) return momento;
  const [, , mes, dia, hora] = m;
  return `${dia}/${mes} ${hora}`;
}

/**
 * Par fundo/borda de cada status, em tokens SIBH. O `normal` é branco com borda
 * cinza fina; os demais são pastel com borda saturada, idênticos ao site.
 */
const CARD_STATUS: Record<StatusNivel, { fundo: string; borda: string }> = {
  normal: {
    fundo: '--sibh-card-normal-fundo',
    borda: '--sibh-card-normal-borda',
  },
  atencao: {
    fundo: '--sibh-card-atencao-fundo',
    borda: '--sibh-card-atencao-borda',
  },
  alerta: {
    fundo: '--sibh-card-alerta-fundo',
    borda: '--sibh-card-alerta-borda',
  },
  emergencia: {
    fundo: '--sibh-card-emergencia-fundo',
    borda: '--sibh-card-emergencia-borda',
  },
  extravasamento: {
    fundo: '--sibh-card-extravasamento-fundo',
    borda: '--sibh-card-extravasamento-borda',
  },
};

/**
 * Seta de tendência no padrão SIBH (rosa #f74f78). Sem série temporal nesta
 * fase, mostra "=" (estável) — neutro, sem inventar direção. Decorativa: a
 * informação real (valor/status) está no texto e no aria-label do card.
 */
function SetaTendencia() {
  return (
    <svg
      width={11}
      height={11}
      viewBox="0 0 11 11"
      className="shrink-0"
      aria-hidden="true"
      style={{ color: 'hsl(var(--sibh-tendencia))' }}
    >
      <path
        d="M2 4h7M2 7h7"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

/** Chevron fino (baixo = mínimo, cima = máximo), igual à linha min/max do SIBH. */
function Chevron({ direcao }: { direcao: 'cima' | 'baixo' }) {
  const d = direcao === 'cima' ? 'M1.5 6 L5 2.5 L8.5 6' : 'M1.5 3.5 L5 7 L8.5 3.5';
  return (
    <svg
      width={9}
      height={9}
      viewBox="0 0 10 9"
      className="shrink-0"
      aria-hidden="true"
    >
      <path
        d={d}
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export const NodeNivel = memo(NodeNivelBase);
