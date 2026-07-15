/**
 * Rotulos PT-BR e classes de cor (badges) do modulo Estoque. Modulo PURO, sem
 * JSX nem I/O: seguro para o cliente e testavel isoladamente. Sem emoji, sem
 * traco (padrao-ui). As classes usam apenas tokens ja presentes no projeto.
 */

import type {
  Estado,
  Natureza,
  Status,
  TipoMovimentacao,
  UnidadeFisica,
} from './dtos';

export const ROTULO_NATUREZA: Record<Natureza, string> = {
  serializado: 'Serializado',
  quantificavel: 'Quantificável',
};

export const ROTULO_ESTADO: Record<Estado, string> = {
  novo: 'Novo',
  bom: 'Bom',
  usado: 'Usado',
  defeito: 'Defeito',
  sucata: 'Sucata',
};

export const ROTULO_STATUS: Record<Status, string> = {
  ativo: 'Ativo',
  defeito: 'Defeito',
  descarte: 'Descarte',
};

export const ROTULO_TIPO_MOV: Record<TipoMovimentacao, string> = {
  entrada: 'Entrada',
  saida: 'Saída',
  transferencia: 'Transferência',
  baixa: 'Baixa',
  ajuste: 'Ajuste',
};

export const ROTULO_UNIDADE_FISICA: Record<UnidadeFisica, string> = {
  PENHA: 'Penha',
  ARARAQUARA: 'Araraquara',
};

/**
 * Descricao acessivel de cada tipo de movimentacao, usada em dicas e no dialog.
 * Texto claro para leitor de tela e para o operador entender o efeito.
 */
export const AJUDA_TIPO_MOV: Record<TipoMovimentacao, string> = {
  entrada: 'Registra a entrada do item em um local de destino.',
  saida: 'Registra a saída do item de um local de origem.',
  transferencia: 'Move o item de um local de origem para um destino diferente.',
  baixa: 'Dá baixa no item (descarte). Exige motivo.',
  ajuste: 'Corrige estado, situação ou local do item serializado. Exige motivo.',
};

/** Classe de badge (tint + texto) por estado fisico. */
export function classeBadgeEstado(estado: Estado | null): string {
  switch (estado) {
    case 'novo':
      return 'bg-blue-50 text-blue-900 border-blue-300';
    case 'bom':
      return 'bg-green-50 text-gov-sucesso border-green-300';
    case 'usado':
      return 'bg-app-surface-2 text-app-fg-muted border-app-border-subtle';
    case 'defeito':
      return 'bg-amber-50 text-amber-900 border-amber-300';
    case 'sucata':
      return 'bg-red-50 text-gov-perigo border-red-300';
    default:
      return 'bg-app-surface-2 text-app-fg-subtle border-app-border-subtle';
  }
}

/** Classe de badge (tint + texto) por situacao no inventario. */
export function classeBadgeStatus(status: Status): string {
  switch (status) {
    case 'ativo':
      return 'bg-green-50 text-gov-sucesso border-green-300';
    case 'defeito':
      return 'bg-amber-50 text-amber-900 border-amber-300';
    case 'descarte':
      return 'bg-red-50 text-gov-perigo border-red-300';
  }
}

/** Classe de badge (tint + texto) por tipo de movimentacao. */
export function classeBadgeTipoMov(tipo: TipoMovimentacao): string {
  switch (tipo) {
    case 'entrada':
      return 'bg-green-50 text-gov-sucesso border-green-300';
    case 'saida':
      return 'bg-amber-50 text-amber-900 border-amber-300';
    case 'transferencia':
      return 'bg-blue-50 text-blue-900 border-blue-300';
    case 'baixa':
      return 'bg-red-50 text-gov-perigo border-red-300';
    case 'ajuste':
      return 'bg-app-surface-2 text-app-fg-muted border-app-border-subtle';
  }
}

/** Rotulo do estado com fallback para nao informado. */
export function rotuloEstado(estado: Estado | null): string {
  return estado ? ROTULO_ESTADO[estado] : 'Não informado';
}

/** Formata uma data ISO para o padrao pt-BR com data e hora. */
export function formatarDataHora(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

/** Formata uma data ISO (YYYY-MM-DD ou timestamp) apenas com a data. */
export function formatarData(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}
