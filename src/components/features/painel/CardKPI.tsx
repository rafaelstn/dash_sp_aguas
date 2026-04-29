import Link from 'next/link';
import { ArrowRight, type LucideIcon } from 'lucide-react';

export type SeveridadeKPI = 'critica' | 'alta' | 'media' | 'info' | 'sucesso';

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
}: CardKPIProps) {
  const est = estilos[severidade];
  const valorFormatado =
    typeof valor === 'number' && formatarValor
      ? valor.toLocaleString('pt-BR')
      : valor;

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
            {titulo}
          </p>
          <p className="tabular mt-0.5 text-2xl font-semibold text-app-fg">
            {valorFormatado}
          </p>
          {contexto ? (
            <p className="text-xs text-app-fg-subtle">{contexto}</p>
          ) : null}
        </div>
      </div>
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
