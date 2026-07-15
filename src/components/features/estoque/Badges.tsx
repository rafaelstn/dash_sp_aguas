import { AlertTriangle } from 'lucide-react';
import type { Estado, Status, TipoMovimentacao } from './dtos';
import {
  ROTULO_STATUS,
  ROTULO_TIPO_MOV,
  classeBadgeEstado,
  classeBadgeStatus,
  classeBadgeTipoMov,
  rotuloEstado,
} from './rotulos';

const BASE =
  'inline-flex items-center rounded border px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide whitespace-nowrap';

/**
 * Etiquetas do modulo. Cor + TEXTO sempre juntos: o significado nunca depende
 * so da cor (WCAG 1.4.1 / e-MAG). Sem emoji, apenas tokens do projeto.
 */
export function BadgeEstado({ estado }: { estado: Estado | null }) {
  return <span className={`${BASE} ${classeBadgeEstado(estado)}`}>{rotuloEstado(estado)}</span>;
}

export function BadgeStatus({ status }: { status: Status }) {
  return <span className={`${BASE} ${classeBadgeStatus(status)}`}>{ROTULO_STATUS[status]}</span>;
}

export function BadgeTipoMov({ tipo }: { tipo: TipoMovimentacao }) {
  return <span className={`${BASE} ${classeBadgeTipoMov(tipo)}`}>{ROTULO_TIPO_MOV[tipo]}</span>;
}

/**
 * Selo de reposicao para material quantificavel abaixo do minimo. Nao depende so
 * da cor (WCAG 1.4.1 / e-MAG): traz o texto "Abaixo do minimo" e, quando ha
 * minimo, o valor "mín X" para contexto. O icone e decorativo (aria-hidden).
 */
export function BadgeAbaixoMinimo({ minimo }: { minimo?: number | null }) {
  return (
    <span className={`${BASE} gap-1 border-amber-300 bg-amber-50 text-amber-900`}>
      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
      Abaixo do mínimo
      {minimo != null ? ` (mín ${minimo.toLocaleString('pt-BR')})` : ''}
    </span>
  );
}
