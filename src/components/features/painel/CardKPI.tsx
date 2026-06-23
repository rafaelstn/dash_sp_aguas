import Link from 'next/link';
import { ArrowRight, TrendingUp, TrendingDown, Minus, type LucideIcon } from 'lucide-react';
import { calcularDelta, rotuloDelta } from '@/lib/delta';
import { Sparkline } from './Sparkline';

export type SeveridadeKPI = 'critica' | 'alta' | 'media' | 'info' | 'sucesso';

const ROTULOS_SEVERIDADE: Record<SeveridadeKPI, string> = {
  critica: 'Crítico',
  alta: 'Alta atenção',
  media: 'Atenção',
  info: 'Informativo',
  sucesso: 'Sob controle',
};

export interface CardKPIProps {
  titulo: string;
  valor: number | string;
  /** Texto contextual curto (ex: "de 2.483 postos"). */
  contexto?: string;
  href?: string;
  rotuloAcao?: string;
  severidade?: SeveridadeKPI;
  icone?: LucideIcon;
  /** Formata valor numérico com pt-BR. */
  formatarValor?: boolean;
  /**
   * Valor do mesmo indicador no período anterior. Quando informado (e o
   * valor atual for numérico), o card mostra o delta (seta + percentual)
   * com rótulo textual para acessibilidade.
   */
  valorAnterior?: number;
  /** Rótulo curto do período de comparação (ex: "vs. mês anterior"). */
  rotuloPeriodo?: string;
  /**
   * Série histórica para o sparkline (mais antigo → mais recente). Render
   * só acontece com 2+ pontos. Opcional: sem série, nenhum gráfico aparece.
   */
  serie?: readonly number[];
  /**
   * Direção "boa" do indicador. Para "postos ativos", subir é bom (verde);
   * para "postos sem arquivo", subir é ruim (vermelho). Padrão: 'maior'.
   */
  sentidoPositivo?: 'maior' | 'menor';
}

const estilos: Record<SeveridadeKPI, { borda: string; icone: string; fundoIcone: string }> = {
  critica: {
    borda: 'border-l-4 border-l-gov-perigo',
    icone: 'text-gov-perigo',
    fundoIcone: 'bg-red-50',
  },
  alta: {
    borda: 'border-l-4 border-l-gov-alerta',
    icone: 'text-gov-alerta',
    fundoIcone: 'bg-amber-50',
  },
  media: {
    borda: 'border-l-4 border-l-gov-azul',
    icone: 'text-gov-azul',
    fundoIcone: 'bg-gov-azul-claro',
  },
  info: {
    borda: 'border-l-4 border-l-app-border',
    icone: 'text-app-fg-muted',
    fundoIcone: 'bg-app-surface-2',
  },
  sucesso: {
    borda: 'border-l-4 border-l-gov-sucesso',
    icone: 'text-gov-sucesso',
    fundoIcone: 'bg-emerald-50',
  },
};

export function CardKPI({
  titulo,
  valor,
  contexto,
  href,
  rotuloAcao = 'Ver detalhes',
  severidade = 'info',
  icone: Icone,
  formatarValor = true,
  valorAnterior,
  rotuloPeriodo = 'vs. período anterior',
  serie,
  sentidoPositivo = 'maior',
}: CardKPIProps) {
  const est = estilos[severidade];
  const valorFormatado =
    typeof valor === 'number' && formatarValor
      ? valor.toLocaleString('pt-BR')
      : valor;

  const delta =
    typeof valor === 'number' && typeof valorAnterior === 'number'
      ? calcularDelta(valor, valorAnterior)
      : null;

  const conteudo = (
    <div
      className={[
        'group flex h-full flex-col rounded-gov-card bg-app-surface p-4 shadow-gov-card transition-all motion-safe:duration-150',
        est.borda,
        href ? 'hover:shadow-gov-card-hover hover:-translate-y-0.5' : '',
      ].join(' ')}
    >
      <div className="flex items-start gap-3">
        {Icone ? (
          <span
            className={['inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md', est.fundoIcone].join(' ')}
            aria-hidden="true"
          >
            <Icone className={['h-5 w-5', est.icone].join(' ')} strokeWidth={2.25} />
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-app-fg-muted">
            <span className="sr-only">{ROTULOS_SEVERIDADE[severidade]}: </span>
            {titulo}
          </p>
          <p className="tabular mt-0.5 text-2xl font-semibold text-app-fg">
            {valorFormatado}
          </p>
          {contexto ? (
            <p className="text-xs text-app-fg-muted">{contexto}</p>
          ) : null}
          {delta ? <DeltaBadge delta={delta} rotuloPeriodo={rotuloPeriodo} sentidoPositivo={sentidoPositivo} /> : null}
        </div>
      </div>
      {serie && serie.length >= 2 ? (
        <div className="mt-3">
          <Sparkline serie={serie} cor={est.icone} />
        </div>
      ) : null}
      {href ? (
        <p
          className={[
            'mt-3 inline-flex items-center gap-1 text-xs font-medium',
            est.icone,
            'transition-[gap] motion-safe:duration-150 group-hover:gap-1.5',
          ].join(' ')}
        >
          <span>{rotuloAcao}</span>
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </p>
      ) : null}
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="block rounded-gov-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
      >
        {conteudo}
      </Link>
    );
  }
  return conteudo;
}

function DeltaBadge({
  delta,
  rotuloPeriodo,
  sentidoPositivo,
}: {
  delta: ReturnType<typeof calcularDelta>;
  rotuloPeriodo: string;
  sentidoPositivo: 'maior' | 'menor';
}) {
  // "Bom" depende do indicador: subir pode ser positivo (postos ativos) ou
  // negativo (postos sem arquivo). Daí a cor; o texto sempre acompanha.
  const ehBom =
    delta.direcao === 'estavel'
      ? null
      : sentidoPositivo === 'maior'
        ? delta.direcao === 'subiu'
        : delta.direcao === 'caiu';

  const cor =
    ehBom === null
      ? 'text-app-fg-muted'
      : ehBom
        ? 'text-gov-sucesso'
        : 'text-gov-perigo';

  const Seta =
    delta.direcao === 'subiu'
      ? TrendingUp
      : delta.direcao === 'caiu'
        ? TrendingDown
        : Minus;

  const percentualVisivel =
    delta.percentual === null
      ? delta.absoluto.toLocaleString('pt-BR', { signDisplay: 'always' })
      : `${delta.percentual.toLocaleString('pt-BR', {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
          signDisplay: 'always',
        })}%`;

  return (
    <p className={`mt-1 inline-flex items-center gap-1 text-xs font-medium ${cor}`}>
      <Seta className="h-3.5 w-3.5" aria-hidden="true" />
      {/* Texto explícito da direção, não só cor (WCAG 1.4.1). */}
      <span className="sr-only">{rotuloDelta(delta)}, </span>
      <span className="tabular" aria-hidden="true">
        {percentualVisivel}
      </span>
      <span className="font-normal text-app-fg-subtle">{rotuloPeriodo}</span>
    </p>
  );
}
