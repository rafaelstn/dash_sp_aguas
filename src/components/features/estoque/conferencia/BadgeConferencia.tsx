import type { SituacaoItem, StatusConferencia } from '../conferencia-dtos';
import {
  ROTULO_SITUACAO_ITEM,
  ROTULO_STATUS_CONFERENCIA,
  classeBadgeSituacaoItem,
  classeBadgeStatusConferencia,
  type TipoDivergenciaUI,
} from '../conferencia-ui';

const BASE =
  'inline-flex items-center rounded border px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide whitespace-nowrap';

/**
 * Badges da conferencia. Cor + TEXTO sempre juntos: o significado nunca depende
 * so da cor (WCAG 1.4.1 / e-MAG). Sem emoji, apenas tokens do projeto.
 */
export function BadgeStatusConferencia({ status }: { status: StatusConferencia }) {
  return (
    <span className={`${BASE} ${classeBadgeStatusConferencia(status)}`}>
      {ROTULO_STATUS_CONFERENCIA[status]}
    </span>
  );
}

export function BadgeSituacaoItem({ situacao }: { situacao: SituacaoItem }) {
  return (
    <span className={`${BASE} ${classeBadgeSituacaoItem(situacao)}`}>
      {ROTULO_SITUACAO_ITEM[situacao]}
    </span>
  );
}

const ROTULO_DIVERGENCIA: Record<TipoDivergenciaUI, string> = {
  sobra: 'Sobra',
  falta: 'Falta',
  nao_encontrado: 'Não encontrado',
  outro_local: 'Em outro local',
};

const CLASSE_DIVERGENCIA: Record<TipoDivergenciaUI, string> = {
  sobra: 'bg-blue-50 text-blue-900 border-blue-300',
  falta: 'bg-amber-50 text-amber-900 border-amber-300',
  nao_encontrado: 'bg-red-50 text-gov-perigo border-red-300',
  outro_local: 'bg-amber-50 text-amber-900 border-amber-300',
};

export function BadgeDivergencia({ tipo }: { tipo: TipoDivergenciaUI }) {
  return <span className={`${BASE} ${CLASSE_DIVERGENCIA[tipo]}`}>{ROTULO_DIVERGENCIA[tipo]}</span>;
}

/** Selo neutro "Reconciliado" (item ja tratado). */
export function BadgeReconciliado() {
  return (
    <span className={`${BASE} bg-green-50 text-gov-sucesso border-green-300`}>Reconciliado</span>
  );
}
