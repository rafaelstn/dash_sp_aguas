import { type ButtonHTMLAttributes, forwardRef } from 'react';

type Variante = 'primario' | 'secundario' | 'perigo';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
}

const classesPorVariante: Record<Variante, string> = {
  primario: 'bg-gov-azul text-white hover:bg-gov-azul-escuro',
  secundario: 'bg-white text-gov-azul border border-gov-azul hover:bg-gov-superficie',
  perigo: 'bg-gov-perigo text-white hover:bg-red-900',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variante = 'primario', className = '', children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      className={`px-4 py-2 rounded font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${classesPorVariante[variante]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
});
