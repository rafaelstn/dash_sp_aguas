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
  const { elemento, overlay } = data;
  const aoVivo = overlay?.aoVivo === true;
  const semVinculo = aoVivo && overlay?.leitura === undefined;
  const leitura = overlay?.leitura ?? null;

  // Valor exibido: ao vivo usa a leitura (chuva em mm); senão, o salvo.
  const valorExibido = aoVivo ? (leitura?.valorMm ?? null) : elemento.valor;
  const temValor = valorExibido !== null && valorExibido !== undefined;
  const valorTexto = temValor
    ? valorExibido!.toLocaleString('pt-BR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      })
    : '— —';

  const descricao =
    `Posto de chuva ${elemento.nome}, código ${elemento.codigo}. ` +
    (semVinculo
      ? 'Sem posto vinculado.'
      : temValor
        ? `Acumulado ${valorTexto} milímetros${aoVivo && leitura ? `, lido em ${leitura.momento}` : ''}.`
        : 'Sem leitura.');

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

      {/* Rodapé: "Chuva" no modo normal; ao vivo mostra o momento da leitura
          ou o aviso de elemento sem vínculo. */}
      <div className="mt-0.5 text-center">
        {aoVivo && semVinculo ? (
          <span className="text-2xs font-medium text-app-fg-subtle">
            Sem posto vinculado
          </span>
        ) : aoVivo && leitura ? (
          <span className="text-2xs text-app-fg-muted">
            {formatarMomento(leitura.momento)}
          </span>
        ) : aoVivo ? (
          <span className="text-2xs font-medium text-app-fg-subtle">
            Sem leitura
          </span>
        ) : (
          <span
            className="text-2xs font-semibold"
            style={{ color: 'hsl(var(--sibh-chuva))' }}
          >
            Chuva
          </span>
        )}
      </div>
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

export const NodeChuva = memo(NodeChuvaBase);
