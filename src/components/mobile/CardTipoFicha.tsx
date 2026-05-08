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
        className="flex min-h-[112px] cursor-not-allowed flex-col justify-between rounded-gov-card border border-app-border-subtle bg-app-surface p-4 opacity-60"
        aria-disabled="true"
        aria-label={`${rotulo} — em breve`}
        role="group"
      >
        <div
          className="flex h-10 w-10 items-center justify-center rounded-md bg-app-surface-2 text-app-fg-muted"
          aria-hidden="true"
        >
          <span className="font-mono text-sm font-semibold">{numeroFormatado}</span>
        </div>
        <div>
          <p className="text-md font-semibold text-app-fg">{rotulo}</p>
          <p className="mt-1 text-xs text-app-fg-muted">Em breve</p>
        </div>
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="group flex min-h-[112px] flex-col justify-between rounded-gov-card border border-app-border bg-app-surface p-4 shadow-gov-card transition-all duration-150 hover:border-gov-azul hover:shadow-gov-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul focus-visible:ring-offset-2 active:scale-[0.98]"
      aria-label={`Iniciar ficha de ${rotulo}`}
    >
      <div
        className="flex h-10 w-10 items-center justify-center rounded-md bg-gov-azul-claro text-gov-azul-escuro"
        aria-hidden="true"
      >
        <span className="font-mono text-sm font-bold">{numeroFormatado}</span>
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
