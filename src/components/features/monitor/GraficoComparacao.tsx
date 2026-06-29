'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Estacao } from './tipos';
import type { DiaComparacao } from './useLeiturasMultiplas';
import { corComparacao } from './cores-comparacao';
import { fmtDataCurta, fmtDataLonga } from './estatisticas-leituras';

const COR_GRID = '#E5E7EB';
const COR_EIXO = '#5F6572';

interface GraficoComparacaoProps {
  /** Série diária unificada (ordem cronológica crescente). */
  dias: readonly DiaComparacao[];
  /**
   * Estações exibidas, na ordem da cesta. A posição define a cor
   * (corComparacao(indice)), idêntico ao painel oficial.
   */
  estacoes: readonly Estacao[];
}

/** Rótulo curto de uma estação para legenda e tooltip. */
function rotuloEstacao(e: Estacao): string {
  return e.prefixo || e.nome || 'Estação';
}

/**
 * Gráfico de barras agrupadas da chuva diária de várias estações.
 *
 * Barra (e não linha/área) porque a chuva diária é acumulada por dia, sem
 * continuidade entre dias: a barra lê o valor de cada dia sem sugerir
 * interpolação falsa (mesma justificativa do GraficoChuva individual). Uma série
 * por estação, com cor pelo índice na cesta.
 *
 * Acessibilidade: este é o canal VISUAL. A alternativa textual (e-MAG / WCAG
 * 1.1.1) é a TabelaComparacao renderizada ao lado, sempre disponível com os
 * mesmos números. O SVG recebe role="img" + aria-label de resumo, e a cor nunca
 * é a única pista (a legenda e a tabela trazem o nome de cada estação).
 */
export function GraficoComparacao({ dias, estacoes }: GraficoComparacaoProps) {
  // Cada ponto do gráfico é um dia; cada estação vira uma chave (o id) no ponto.
  const dados = dias.map((d) => {
    const ponto: Record<string, number | string> = {
      data: d.data,
      rotulo: fmtDataCurta(`${d.data}T12:00:00`),
    };
    for (const e of estacoes) {
      const mm = d.porEstacao[e.id];
      if (mm !== undefined) ponto[e.id] = mm;
    }
    return ponto;
  });

  const nomes = estacoes.map(rotuloEstacao).join(', ');

  return (
    <div
      role="img"
      aria-label={`Gráfico de barras comparando a chuva diária em milímetros de ${estacoes.length} estações (${nomes}) ao longo de ${dias.length} dias. A tabela ao lado traz os mesmos valores.`}
      className="h-72 w-full sm:h-80"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={dados}
          margin={{ top: 8, right: 8, bottom: 4, left: -8 }}
          barGap={1}
          barCategoryGap="18%"
        >
          <CartesianGrid strokeDasharray="3 3" stroke={COR_GRID} vertical={false} />
          <XAxis
            dataKey="rotulo"
            tick={{ fontSize: 11, fill: COR_EIXO }}
            tickLine={false}
            axisLine={{ stroke: COR_GRID }}
            interval="preserveStartEnd"
            minTickGap={16}
          />
          <YAxis
            tick={{ fontSize: 11, fill: COR_EIXO }}
            tickLine={false}
            axisLine={{ stroke: COR_GRID }}
            width={44}
            unit=" mm"
            allowDecimals={false}
          />
          <Tooltip
            cursor={{ fill: 'rgba(30,64,175,0.06)' }}
            content={<TooltipComparacao estacoes={estacoes} />}
          />
          {estacoes.map((e, indice) => (
            <Bar
              key={e.id}
              dataKey={e.id}
              name={rotuloEstacao(e)}
              fill={corComparacao(indice)}
              radius={[2, 2, 0, 0]}
              isAnimationActive={false}
              maxBarSize={22}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

interface ItemTooltip {
  dataKey?: string | number;
  value?: number | string;
  color?: string;
  payload?: { data?: string };
}

interface TooltipComparacaoProps {
  active?: boolean;
  payload?: ItemTooltip[];
  estacoes: readonly Estacao[];
}

/**
 * Tooltip da comparação: data por extenso + valor de cada estação presente no
 * dia, com a bolinha da cor e o nome em texto (a cor não é a única pista).
 */
function TooltipComparacao({
  active,
  payload,
  estacoes,
}: TooltipComparacaoProps) {
  if (!active || !payload || payload.length === 0) return null;

  const data = payload[0]?.payload?.data;
  const porId = new Map(estacoes.map((e) => [e.id, e]));

  return (
    <div className="max-w-xs rounded border border-app-border-subtle bg-app-surface px-3 py-2 text-xs shadow-gov-card-hover">
      <p className="font-semibold text-app-fg">
        {data ? fmtDataLonga(`${data}T12:00:00`) : ''}
      </p>
      <ul className="mt-1 space-y-0.5">
        {payload.map((item) => {
          const id = String(item.dataKey ?? '');
          const estacao = porId.get(id);
          if (!estacao) return null;
          return (
            <li key={id} className="flex items-center gap-1.5 text-app-fg-muted">
              <span
                aria-hidden="true"
                className="inline-block h-2 w-2 shrink-0 rounded-sm"
                style={{ background: item.color }}
              />
              <span className="truncate">{rotuloEstacao(estacao)}:</span>
              <span className="tabular text-app-fg">{formatarMm(item.value)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function formatarMm(v: number | string | undefined): string {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return '—';
  return `${(Math.round(n * 10) / 10).toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} mm`;
}
