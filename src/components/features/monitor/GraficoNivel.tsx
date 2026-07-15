'use client';

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { PontoNivel } from './tipos-nivel';
import { fmtDataCurta, fmtDataLonga } from './estatisticas-leituras';
import { fmtMetros } from './estatisticas-nivel';

// Tokens de globals.css resolvidos em hex: o recharts desenha em SVG fora do
// fluxo de classes Tailwind, então precisa do valor literal (mesmo padrão do
// GraficoChuva). gov-azul = linha do nível médio; a faixa min-máx usa o mesmo
// azul com baixa opacidade (área sutil atrás da linha).
const COR_LINHA = '#1E40AF';
const COR_FAIXA = '#1E40AF';
const COR_GRID = '#E5E7EB';
const COR_EIXO = '#5F6572';

interface GraficoNivelProps {
  itens: readonly PontoNivel[];
}

/**
 * Gráfico de linha do nível diário (metros). Linha (e não barra) porque o nível
 * é uma grandeza contínua no tempo: a interpolação entre dias representa a
 * variação real, ao contrário da chuva acumulada por dia. Uma faixa sutil
 * (área) desenha o intervalo mínimo-máximo de cada dia atrás da linha do médio.
 *
 * Acessibilidade: o gráfico é a representação VISUAL. A alternativa textual
 * (e-MAG / WCAG 1.1.1) é a TabelaNivel renderizada no painel, sempre disponível
 * e com os mesmos valores. Aqui o SVG recebe role="img" + aria-label com o
 * resumo, e a tooltip não é a única via de leitura.
 */
export function GraficoNivel({ itens }: GraficoNivelProps) {
  const dados = itens.map((i) => ({
    momento: i.momento,
    dia: fmtDataCurta(i.momento),
    nivelMedioM: i.nivelMedioM,
    nivelMinM: i.nivelMinM,
    nivelMaxM: i.nivelMaxM,
    // Faixa min-máx como par [min, max]: o recharts desenha a área entre os dois
    // valores quando o dataKey aponta para uma tupla de dois números.
    faixa: [i.nivelMinM, i.nivelMaxM] as [number, number],
  }));

  return (
    <div
      role="img"
      aria-label={`Gráfico de linha do nível diário em metros ao longo de ${itens.length} dias, com faixa de mínimo e máximo por dia. A tabela de nível abaixo traz os mesmos valores.`}
      className="h-64 w-full"
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={dados} margin={{ top: 8, right: 8, bottom: 4, left: -4 }}>
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
            width={52}
            unit=" m"
            domain={['auto', 'auto']}
            allowDecimals
          />
          <Tooltip cursor={{ stroke: COR_GRID }} content={<TooltipNivel />} />
          <Area
            dataKey="faixa"
            name="faixa"
            stroke="none"
            fill={COR_FAIXA}
            fillOpacity={0.12}
            isAnimationActive={false}
            connectNulls
            activeDot={false}
          />
          <Line
            dataKey="nivelMedioM"
            name="nivelMedioM"
            type="monotone"
            stroke={COR_LINHA}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3 }}
            isAnimationActive={false}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Item do payload da tooltip do recharts (tipagem mínima e defensiva). */
interface ItemTooltip {
  dataKey?: string | number;
  payload?: {
    momento?: string;
    nivelMedioM?: number;
    nivelMinM?: number;
    nivelMaxM?: number;
  };
}

interface TooltipNivelProps {
  active?: boolean;
  payload?: ItemTooltip[];
}

/**
 * Tooltip customizada: data por extenso + nível médio, mínimo e máximo do dia,
 * em metros. Tipada de forma defensiva (lê só o que usa do payload) para não
 * acoplar a build aos tipos internos do recharts.
 */
function TooltipNivel({ active, payload }: TooltipNivelProps) {
  if (!active || !payload || payload.length === 0) return null;

  const ponto = payload[0]?.payload;
  if (!ponto) return null;

  return (
    <div className="rounded border border-app-border-subtle bg-app-surface px-3 py-2 text-xs shadow-gov-card-hover">
      <p className="font-semibold text-app-fg">
        {ponto.momento ? fmtDataLonga(ponto.momento) : ''}
      </p>
      <p className="mt-1 flex items-center gap-1.5 text-app-fg-muted">
        <span
          aria-hidden="true"
          className="inline-block h-2 w-2 rounded-sm"
          style={{ background: COR_LINHA }}
        />
        Nível médio: {formatarValor(ponto.nivelMedioM)}
      </p>
      <p className="mt-0.5 text-app-fg-muted">
        Mínimo: {formatarValor(ponto.nivelMinM)} · Máximo:{' '}
        {formatarValor(ponto.nivelMaxM)}
      </p>
    </div>
  );
}

function formatarValor(v: number | undefined): string {
  if (typeof v !== 'number' || !Number.isFinite(v)) return '—';
  return fmtMetros(v);
}
