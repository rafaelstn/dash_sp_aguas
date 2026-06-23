import { sparklinePath } from '@/lib/delta';

export interface SparklineProps {
  serie: readonly number[];
  /** Cor da linha (classe de stroke do Tailwind). */
  cor?: string;
  className?: string;
}

const LARGURA = 100;
const ALTURA = 28;

/**
 * Mini-gráfico de linha (sparkline) para tendência de um KPI. Puramente
 * decorativo do ponto de vista de leitor de tela (`aria-hidden`): o número
 * e o delta textual já comunicam o dado. Não anima — é estático, então
 * `prefers-reduced-motion` não se aplica.
 *
 * Renderiza nada quando a série tem menos de 2 pontos.
 */
export function Sparkline({
  serie,
  cor = 'text-app-fg-muted',
  className = '',
}: SparklineProps) {
  const d = sparklinePath(serie, LARGURA, ALTURA);
  if (!d) return null;
  return (
    <svg
      viewBox={`0 0 ${LARGURA} ${ALTURA}`}
      preserveAspectRatio="none"
      role="img"
      aria-hidden="true"
      className={`h-7 w-full ${cor} ${className}`}
    >
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
