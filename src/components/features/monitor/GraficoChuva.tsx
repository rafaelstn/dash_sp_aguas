'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { LeituraDiaria } from './tipos-leituras';
import { fmtDataCurta, fmtDataLonga } from './estatisticas-leituras';

// Tokens de globals.css resolvidos em hex: o recharts desenha em SVG fora do
// fluxo de classes Tailwind, então precisa do valor literal (mesmo padrão da
// paleta do mapa). gov-azul = automática; status-warn (âmbar AA) = manual.
const COR_AUTO = '#1E40AF';
const COR_MANUAL = '#92400E';
const COR_GRID = '#E5E7EB';
const COR_EIXO = '#5F6572';

interface GraficoChuvaProps {
  itens: readonly LeituraDiaria[];
  /** Quando true, desenha também a série manual (estrutura pronta p/ B futura). */
  mostrarManual: boolean;
}

/**
 * Gráfico de barras da chuva diária. Barra (e não área) porque a chuva diária é
 * uma grandeza acumulada por dia, sem continuidade entre dias: a barra lê o
 * valor de cada dia sem sugerir interpolação falsa.
 *
 * Acessibilidade: o gráfico é a representação VISUAL. A alternativa textual
 * (e-MAG / WCAG 1.1.1) é a tabela de leituras renderizada no painel, sempre
 * disponível. Aqui o SVG recebe role="img" + aria-label com o resumo, e a
 * tooltip não é a única via (a tabela traz os mesmos números).
 */
export function GraficoChuva({ itens, mostrarManual }: GraficoChuvaProps) {
  const dados = itens.map((i) => ({
    momento: i.momento,
    dia: fmtDataCurta(i.momento),
    automaticoMm: i.automaticoMm,
    manualMm: i.manualMm,
  }));

  return (
    <div
      role="img"
      aria-label={`Gráfico de barras da chuva diária em milímetros ao longo de ${itens.length} dias. A tabela de leituras abaixo traz os mesmos valores.`}
      className="h-64 w-full"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={dados}
          margin={{ top: 8, right: 8, bottom: 4, left: -8 }}
          barGap={2}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={COR_GRID} vertical={false} />
          <XAxis
            dataKey="dia"
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
            content={<TooltipChuva mostrarManual={mostrarManual} />}
          />
          {mostrarManual ? (
            <Legend
              wrapperStyle={{ fontSize: 12, color: COR_EIXO }}
              formatter={(value) =>
                value === 'automaticoMm' ? 'Automática' : 'Manual'
              }
            />
          ) : null}
          <Bar
            dataKey="automaticoMm"
            name="automaticoMm"
            fill={COR_AUTO}
            radius={[2, 2, 0, 0]}
            isAnimationActive={false}
            maxBarSize={28}
          />
          {mostrarManual ? (
            <Bar
              dataKey="manualMm"
              name="manualMm"
              fill={COR_MANUAL}
              radius={[2, 2, 0, 0]}
              isAnimationActive={false}
              maxBarSize={28}
            />
          ) : null}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Item do payload da tooltip do recharts (tipagem mínima e defensiva). */
interface ItemTooltip {
  dataKey?: string | number;
  value?: number | string;
  payload?: { momento?: string };
}

interface TooltipChuvaProps {
  active?: boolean;
  payload?: ItemTooltip[];
  mostrarManual: boolean;
}

/**
 * Tooltip customizada: data por extenso + valor em mm por série. Tipada de
 * forma defensiva (lê só o que usa do payload) para não acoplar a build aos
 * tipos internos do recharts.
 */
function TooltipChuva({ active, payload, mostrarManual }: TooltipChuvaProps) {
  if (!active || !payload || payload.length === 0) return null;

  const momento = payload[0]?.payload?.momento;
  const auto = payload.find((p) => p.dataKey === 'automaticoMm')?.value;
  const manual = payload.find((p) => p.dataKey === 'manualMm')?.value;

  return (
    <div className="rounded border border-app-border-subtle bg-app-surface px-3 py-2 text-xs shadow-gov-card-hover">
      <p className="font-semibold text-app-fg">
        {momento ? fmtDataLonga(momento) : ''}
      </p>
      <p className="mt-1 flex items-center gap-1.5 text-app-fg-muted">
        <span
          aria-hidden="true"
          className="inline-block h-2 w-2 rounded-sm"
          style={{ background: COR_AUTO }}
        />
        Automática: {formatarValor(auto)}
      </p>
      {mostrarManual ? (
        <p className="mt-0.5 flex items-center gap-1.5 text-app-fg-muted">
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 rounded-sm"
            style={{ background: COR_MANUAL }}
          />
          Manual: {formatarValor(manual)}
        </p>
      ) : null}
    </div>
  );
}

function formatarValor(v: number | string | undefined): string {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return '—';
  return `${(Math.round(n * 10) / 10).toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })} mm`;
}
