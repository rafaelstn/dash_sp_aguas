import Link from 'next/link';
import type { CodigoTipoDocumento } from '@/domain/tipo-documento';

interface CardTipoFichaProps {
  codigo: CodigoTipoDocumento;
  rotulo: string;
  descricao?: string;
  /** URL pra navegar quando clicar. */
  href: string;
  /** Disponível pra preenchimento? Tipos sem schema exibem como desabilitados. */
  disponivel?: boolean;
}

/**
 * Ícone temático por tipo de ficha. SVG inline (stroke currentColor), sem
 * dependência de runtime nem custo de bundle. Mantém leitura rápida em campo
 * (uma mão, ao ar livre) sem depender só do número. O número segue presente
 * no canto como referência oficial do tipo.
 *
 * Mapa intencionalmente parcial: tipos sem ícone caem no genérico (documento).
 */
function IconeTipo({ codigo }: { codigo: CodigoTipoDocumento }) {
  const comum = {
    'aria-hidden': true as const,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: 'h-6 w-6',
  };
  switch (codigo) {
    case 1: // Cadastro do posto: pino de localização
      return (
        <svg {...comum}>
          <path d="M12 21s7-6.5 7-11a7 7 0 1 0-14 0c0 4.5 7 11 7 11Z" />
          <circle cx="12" cy="10" r="2.5" />
        </svg>
      );
    case 2: // Inspeção PCD: sensor / sinal
      return (
        <svg {...comum}>
          <path d="M5 13a9 9 0 0 1 14 0" />
          <path d="M8 16a5 5 0 0 1 8 0" />
          <circle cx="12" cy="19" r="1.2" />
        </svg>
      );
    case 3: // Inspeção fluvio/pluviométrica: gota
      return (
        <svg {...comum}>
          <path d="M12 3s6 6.6 6 10.5A6 6 0 0 1 6 13.5C6 9.6 12 3 12 3Z" />
        </svg>
      );
    case 6: // Troca de observador: pessoas
      return (
        <svg {...comum}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
          <path d="M16 7.5a3 3 0 0 1 0 5.5M20.5 20a5.5 5.5 0 0 0-4-5.3" />
        </svg>
      );
    case 7: // Medição de vazão: ondas
      return (
        <svg {...comum}>
          <path d="M3 8c2.2 0 2.2 2 4.4 2S9.6 8 11.8 8 14 10 16.2 10 18.4 8 21 8" />
          <path d="M3 13c2.2 0 2.2 2 4.4 2S9.6 13 11.8 13 14 15 16.2 15 18.4 13 21 13" />
        </svg>
      );
    default: // 4, 5 e fallback: documento com linhas
      return (
        <svg {...comum}>
          <path d="M7 3h7l4 4v14H7z" />
          <path d="M14 3v4h4" />
          <path d="M10 12h5M10 15.5h5" />
        </svg>
      );
  }
}

/**
 * Card grande, touch-friendly, área mínima 64×64 (a11y / Apple HIG).
 * Mostra ícone + nome do tipo de ficha + descrição curta.
 *
 * Aplica Tailwind direto no design token `gov-azul` para ter contraste
 * AA garantido (8.6:1 contra branco — ver globals.css).
 *
 * Server Component: nenhum estado, só dados estáticos do schema.
 */
export function CardTipoFicha({
  codigo,
  rotulo,
  descricao,
  href,
  disponivel = true,
}: CardTipoFichaProps) {
  const numeroFormatado = String(codigo).padStart(2, '0');

  if (!disponivel) {
    return (
      <div
        className="relative flex min-h-[120px] cursor-not-allowed flex-col justify-between rounded-gov-card border border-app-border-subtle bg-app-surface p-4 opacity-60"
        aria-disabled="true"
        aria-label={`${rotulo}, em breve`}
        role="group"
      >
        <span
          className="absolute right-3 top-3 font-mono text-2xs font-semibold text-app-fg-subtle"
          aria-hidden="true"
        >
          {numeroFormatado}
        </span>
        <div
          className="flex h-10 w-10 items-center justify-center rounded-md bg-app-surface-2 text-app-fg-muted"
          aria-hidden="true"
        >
          <IconeTipo codigo={codigo} />
        </div>
        <div>
          <p className="text-md font-semibold leading-tight text-app-fg">{rotulo}</p>
          <p className="mt-1 text-xs text-app-fg-muted">Em breve</p>
        </div>
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="group relative flex min-h-[120px] flex-col justify-between rounded-gov-card border border-app-border bg-app-surface p-4 shadow-gov-card transition-[border-color,box-shadow,transform] duration-150 ease-gov-ease hover:border-gov-azul hover:shadow-gov-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul focus-visible:ring-offset-2 active:scale-[0.98] active:bg-app-surface-2"
      aria-label={`Iniciar ficha de ${rotulo}`}
    >
      <span
        className="absolute right-3 top-3 font-mono text-2xs font-semibold text-app-fg-subtle"
        aria-hidden="true"
      >
        {numeroFormatado}
      </span>
      <div
        className="flex h-10 w-10 items-center justify-center rounded-md bg-gov-azul-claro text-gov-azul-escuro transition-colors group-hover:bg-gov-azul group-hover:text-white"
        aria-hidden="true"
      >
        <IconeTipo codigo={codigo} />
      </div>
      <div>
        <p className="text-md font-semibold leading-tight text-app-fg">
          {rotulo}
        </p>
        {descricao ? (
          <p className="mt-1 line-clamp-2 text-xs text-app-fg-muted">
            {descricao}
          </p>
        ) : null}
      </div>
    </Link>
  );
}
