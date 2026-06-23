import type { ReactNode } from 'react';

export type VarianteSkeleton = 'texto' | 'card' | 'avatar' | 'bloco';

const classesPorVariante: Record<VarianteSkeleton, string> = {
  // Linha de texto — altura de uma linha, cantos suaves.
  texto: 'h-4 w-full rounded',
  // Cartão — bloco alto com o raio dos cards do sistema.
  card: 'h-32 w-full rounded-gov-card',
  // Avatar — círculo.
  avatar: 'h-9 w-9 rounded-full',
  // Bloco genérico — sem dimensão imposta, controlada via className.
  bloco: 'rounded',
};

export interface SkeletonProps {
  variante?: VarianteSkeleton;
  className?: string;
}

/**
 * Placeholder de carregamento. Usa `--border-subtle` (token semântico) em vez
 * da cor de borda antiga, e pulsa só com movimento permitido (o globals já
 * neutraliza `animate-pulse` sob `prefers-reduced-motion`).
 *
 * É `aria-hidden`: o anúncio de carregamento pro leitor de tela é
 * responsabilidade do wrapper `SkeletonGrupo` (role="status"), evitando que
 * cada barrinha vire ruído de leitura.
 */
export function Skeleton({ variante = 'bloco', className = '' }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse bg-app-border-subtle ${classesPorVariante[variante]} ${className}`}
    />
  );
}

export interface SkeletonGrupoProps {
  children: ReactNode;
  /** Mensagem anunciada ao leitor de tela. */
  rotulo?: string;
  className?: string;
}

/**
 * Wrapper acessível para blocos de skeleton. Marca a região como
 * `role="status" aria-live="polite"` para que leitores de tela anunciem o
 * carregamento uma única vez, sem ler cada placeholder individualmente.
 *
 * Use sempre que houver Skeleton solto em um fallback de Suspense ou estado
 * de loading. WCAG 4.1.3 (Status Messages).
 */
export function SkeletonGrupo({
  children,
  rotulo = 'Carregando…',
  className = '',
}: SkeletonGrupoProps) {
  return (
    <div role="status" aria-live="polite" aria-label={rotulo} className={className}>
      {children}
      <span className="sr-only">{rotulo}</span>
    </div>
  );
}
