/**
 * Barra horizontal usada em rankings e distribuições. CSS puro, zero deps.
 *
 * A barra anima a largura com `motion-safe:transition-[width]` — respeita
 * prefers-reduced-motion.
 */
export interface BarraProgressoProps {
  valor: number;
  total: number;
  /** Cor da barra em formato Tailwind (ex: 'bg-gov-azul', 'bg-gov-perigo'). */
  cor?: string;
  /** Altura da barra. */
  tamanho?: 'sm' | 'md';
  /** Exibir texto "X/Y" (ou percentual) ao lado direito. */
  mostrarValor?: boolean;
  formatoValor?: 'absoluto' | 'percentual';
  rotulo?: string;
}

export function BarraProgresso({
  valor,
  total,
  cor = 'bg-gov-azul',
  tamanho = 'md',
  mostrarValor = false,
  formatoValor = 'absoluto',
  rotulo,
}: BarraProgressoProps) {
  const pct = total === 0 ? 0 : Math.min(100, (valor / total) * 100);
  const texto =
    formatoValor === 'percentual'
      ? `${pct.toFixed(1)}%`
      : `${valor.toLocaleString('pt-BR')} / ${total.toLocaleString('pt-BR')}`;

  const altura = tamanho === 'sm' ? 'h-1.5' : 'h-2';

  return (
    <div
      className="flex items-center gap-2"
      role="meter"
      aria-valuenow={valor}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-label={rotulo ?? texto}
    >
      <div
        className={['flex-1 overflow-hidden rounded-full bg-app-surface-2', altura].join(' ')}
      >
        <div
          className={[
            'h-full rounded-full transition-[width] motion-safe:duration-500 motion-safe:ease-out',
            cor,
          ].join(' ')}
          style={{ width: `${pct}%` }}
        />
      </div>
      {mostrarValor ? (
        <span className="tabular mono shrink-0 text-2xs text-app-fg-muted">
          {texto}
        </span>
      ) : null}
    </div>
  );
}
