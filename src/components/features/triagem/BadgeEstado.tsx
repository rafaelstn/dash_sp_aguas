import type { EstadoTriagem } from '@/domain/triagem';

const ROTULOS: Record<EstadoTriagem, string> = {
  pendente: 'Pendente',
  em_revisao: 'Em revisão',
  aprovada: 'Aprovada',
  rejeitada: 'Rejeitada',
  devolvida: 'Devolvida',
};

const CORES: Record<EstadoTriagem, string> = {
  pendente:
    'border-amber-300 bg-amber-50 text-amber-900',
  em_revisao:
    'border-blue-300 bg-blue-50 text-blue-900',
  aprovada:
    'border-green-300 bg-green-50 text-green-900',
  rejeitada:
    'border-red-300 bg-red-50 text-red-900',
  devolvida:
    'border-orange-300 bg-orange-50 text-orange-900',
};

export interface BadgeEstadoProps {
  estado: EstadoTriagem;
  /** Para SR — usado quando só o badge transmite o estado. */
  rotuloAcessivel?: string;
}

/**
 * Badge de estado da triagem. Cores AA-conformes com texto escuro sobre
 * fundo claro (contraste ≥ 7:1 nos pares acima). Nada de só-cor: o
 * rótulo textual está sempre presente.
 */
export function BadgeEstado({ estado, rotuloAcessivel }: BadgeEstadoProps) {
  return (
    <span
      className={[
        'inline-flex items-center rounded-sm border px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide',
        CORES[estado],
      ].join(' ')}
      aria-label={rotuloAcessivel}
    >
      {ROTULOS[estado]}
    </span>
  );
}

export function rotuloEstado(estado: EstadoTriagem): string {
  return ROTULOS[estado];
}
