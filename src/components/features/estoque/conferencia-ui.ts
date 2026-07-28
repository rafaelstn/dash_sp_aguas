/**
 * Logica PURA e rotulos da CONFERENCIA fisica (inventario) no cliente. Sem React,
 * sem I/O: monta o payload de contagem conforme a natureza da sessao, descreve o
 * AJUSTE que a reconciliacao vai gerar (para revisar ANTES de confirmar) e resume
 * um lote de reconciliacao. Espelha as regras do dominio (`resolverReconciliacao`,
 * tabela 4.1 da arquitetura) mas opera sobre os DTOs (datas como string). Sem
 * traco, acento PT-BR correto, sem emoji (padrao-ui). Testavel isoladamente.
 */

import type {
  ConferenciaItemDTO,
  ContagemPayload,
  StatusConferencia,
} from './conferencia-dtos';
import type { SituacaoItem } from '@/domain/estoque/conferencia';
import { formatarDataHora } from './rotulos';

// ── Rotulos ─────────────────────────────────────────────────────────────────

export const ROTULO_STATUS_CONFERENCIA: Record<StatusConferencia, string> = {
  aberta: 'Aberta',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
};

export const ROTULO_SITUACAO_ITEM: Record<SituacaoItem, string> = {
  pendente: 'Pendente',
  conferido: 'Conferido',
  nao_encontrado: 'Não encontrado',
  encontrado_em_outro_local: 'Em outro local',
};

/** Classe de badge (tint + texto) por status da sessao. Cor + texto juntos (WCAG 1.4.1). */
export function classeBadgeStatusConferencia(status: StatusConferencia): string {
  switch (status) {
    case 'aberta':
      return 'bg-blue-50 text-blue-900 border-blue-300';
    case 'concluida':
      return 'bg-green-50 text-gov-sucesso border-green-300';
    case 'cancelada':
      return 'bg-app-surface-2 text-app-fg-muted border-app-border-subtle';
  }
}

/** Classe de badge por situacao de contagem do serializado. */
export function classeBadgeSituacaoItem(situacao: SituacaoItem): string {
  switch (situacao) {
    case 'pendente':
      return 'bg-app-surface-2 text-app-fg-muted border-app-border-subtle';
    case 'conferido':
      return 'bg-green-50 text-gov-sucesso border-green-300';
    case 'nao_encontrado':
      return 'bg-red-50 text-gov-perigo border-red-300';
    case 'encontrado_em_outro_local':
      return 'bg-amber-50 text-amber-900 border-amber-300';
  }
}

// ── Natureza do item (DTO) ───────────────────────────────────────────────────

/** Natureza de um item pelo alvo (serializado usa unidade; quantificavel usa material). */
export function naturezaDoItem(item: ConferenciaItemDTO): 'serializado' | 'quantificavel' {
  return item.materialId ? 'quantificavel' : 'serializado';
}

/** Item ja contado? Serializado: situacao != pendente. Quantificavel: quantidade contada preenchida. */
export function itemContado(item: ConferenciaItemDTO): boolean {
  if (item.materialId) return item.quantidadeContada !== null;
  return item.situacao !== null && item.situacao !== 'pendente';
}

/** Item ja reconciliado (carimbado)? */
export function itemReconciliado(item: ConferenciaItemDTO): boolean {
  return item.reconciliadoEm !== null;
}

/**
 * Linha de trilha do item: quem contou e quem reconciliou, com data. Puro, para
 * ser testavel. Usa o rotulo resolvido pela API; nunca mostra UUID cru, e diz
 * "autoria nao registrada" para item contado antes da migration 0065 (em vez de
 * inventar um responsavel).
 */
export function autoriaDoItem(item: ConferenciaItemDTO): string {
  const partes: string[] = [];
  if (itemContado(item)) {
    const quem = item.contadoPorRotulo ?? item.contadoPor;
    const quando = item.contadoEm ? formatarDataHora(item.contadoEm) : null;
    partes.push(
      quem
        ? `Contado por ${quem}${quando ? ` em ${quando}` : ''}`
        : 'Contado (autoria não registrada)',
    );
  }
  if (item.reconciliadoEm !== null) {
    const quem = item.reconciliadoPorRotulo ?? item.reconciliadoPor;
    partes.push(
      `Reconciliado por ${quem ?? 'autoria não registrada'} em ${formatarDataHora(item.reconciliadoEm)}`,
    );
  }
  return partes.length > 0 ? partes.join(' · ') : 'Ainda não contado';
}

// ── Divergencia (DTO) ─────────────────────────────────────────────────────────

export type TipoDivergenciaUI = 'sobra' | 'falta' | 'nao_encontrado' | 'outro_local';

export interface DivergenciaUI {
  divergente: boolean;
  tipo: TipoDivergenciaUI | null;
  /** Quantificavel: contada - sistema (null para serializado). */
  diferenca: number | null;
}

/**
 * Calcula a divergencia de um item a partir do DTO. Puro. Espelha
 * `calcularDivergencia` do dominio, mas so retorna o que a UI precisa.
 */
export function divergenciaDoItem(item: ConferenciaItemDTO): DivergenciaUI {
  if (item.materialId) {
    if (item.quantidadeContada === null) {
      return { divergente: false, tipo: null, diferenca: null };
    }
    const dif = item.diferenca ?? item.quantidadeContada - (item.quantidadeSistema ?? 0);
    if (dif > 0) return { divergente: true, tipo: 'sobra', diferenca: dif };
    if (dif < 0) return { divergente: true, tipo: 'falta', diferenca: dif };
    return { divergente: false, tipo: null, diferenca: 0 };
  }
  switch (item.situacao) {
    case 'nao_encontrado':
      return { divergente: true, tipo: 'nao_encontrado', diferenca: null };
    case 'encontrado_em_outro_local':
      return { divergente: true, tipo: 'outro_local', diferenca: null };
    default:
      return { divergente: false, tipo: null, diferenca: null };
  }
}

// ── Ajuste previsto pela reconciliacao (o que sera aplicado no estoque) ────────

export type TipoAjuste = 'entrada' | 'saida' | 'transferencia' | 'apuracao' | 'nenhum';

export interface AjustePrevisto {
  tipo: TipoAjuste;
  /** Quantidade movimentada (entrada/saida). null quando nao se aplica. */
  quantidade: number | null;
  /** Frase curta do efeito no estoque, pronta para a tela. */
  texto: string;
  /** true quando a reconciliacao NAO toca o estoque (so carimba). */
  semMovimentacao: boolean;
}

/**
 * Descreve o AJUSTE que a reconciliacao de um item vai gerar, para o operador
 * revisar antes de confirmar (nunca dispara em silencio). `nomeLocal` resolve o
 * rotulo de um local pelo id. Puro. Espelha a tabela 4.1 da arquitetura:
 *  - quantificavel sobra (diferenca > 0)  -> entrada no local esperado
 *  - quantificavel falta (diferenca < 0)  -> saida do local esperado
 *  - serializado em outro local           -> transferencia esperado -> encontrado
 *  - serializado nao encontrado           -> apuracao (carimba, sem baixa automatica)
 *  - sem divergencia                      -> nenhum
 */
export function descreverAjuste(
  item: ConferenciaItemDTO,
  nomeLocal: (id: string | null) => string,
): AjustePrevisto {
  const div = divergenciaDoItem(item);

  if (item.materialId) {
    if (div.tipo === 'sobra' && div.diferenca !== null) {
      const q = div.diferenca;
      return {
        tipo: 'entrada',
        quantidade: q,
        semMovimentacao: false,
        texto: `Entrada de ${q.toLocaleString('pt-BR')} em ${nomeLocal(item.localEsperadoId)} (sobra física).`,
      };
    }
    if (div.tipo === 'falta' && div.diferenca !== null) {
      const q = Math.abs(div.diferenca);
      return {
        tipo: 'saida',
        quantidade: q,
        semMovimentacao: false,
        texto: `Saída de ${q.toLocaleString('pt-BR')} de ${nomeLocal(item.localEsperadoId)} (falta física).`,
      };
    }
    return {
      tipo: 'nenhum',
      quantidade: null,
      semMovimentacao: true,
      texto: 'Sem divergência: nenhum ajuste será gerado.',
    };
  }

  // Serializado
  if (item.situacao === 'encontrado_em_outro_local') {
    return {
      tipo: 'transferencia',
      quantidade: 1,
      semMovimentacao: false,
      texto: `Transferência de ${nomeLocal(item.localEsperadoId)} para ${nomeLocal(item.localEncontradoId)}.`,
    };
  }
  if (item.situacao === 'nao_encontrado') {
    return {
      tipo: 'apuracao',
      quantidade: null,
      semMovimentacao: true,
      texto:
        'Não localizado: marca como apurado, sem baixa automática. A baixa, se confirmada, é feita depois pela movimentação.',
    };
  }
  return {
    tipo: 'nenhum',
    quantidade: null,
    semMovimentacao: true,
    texto: 'Sem divergência: nenhum ajuste será gerado.',
  };
}

// ── Montagem do payload de contagem (por natureza) ────────────────────────────

export interface ResultadoPayload<T> {
  payload: T | null;
  /** Mensagem de erro de validacao (por campo, para exibir no formulario). */
  erro: string | null;
}

/**
 * Monta o payload de contagem do SERIALIZADO. Valida que
 * `encontrado_em_outro_local` traz o local encontrado. Puro.
 */
export function montarContagemSerializado(
  situacao: Exclude<SituacaoItem, 'pendente'>,
  localEncontradoId: string | null,
  observacao?: string,
): ResultadoPayload<ContagemPayload> {
  if (situacao === 'encontrado_em_outro_local' && !localEncontradoId) {
    return { payload: null, erro: 'Selecione o local onde o item foi encontrado.' };
  }
  const obs = observacao?.trim();
  return {
    payload: {
      situacao,
      ...(situacao === 'encontrado_em_outro_local'
        ? { localEncontradoId: localEncontradoId ?? undefined }
        : {}),
      ...(obs ? { observacao: obs } : {}),
    },
    erro: null,
  };
}

/**
 * Monta o payload de contagem do QUANTIFICAVEL. Valida quantidade inteira >= 0.
 * Puro.
 */
export function montarContagemQuantidade(
  quantidadeContada: number,
  observacao?: string,
): ResultadoPayload<ContagemPayload> {
  if (!Number.isFinite(quantidadeContada) || !Number.isInteger(quantidadeContada)) {
    return { payload: null, erro: 'Informe uma quantidade inteira.' };
  }
  if (quantidadeContada < 0) {
    return { payload: null, erro: 'A quantidade não pode ser negativa.' };
  }
  const obs = observacao?.trim();
  return {
    payload: { quantidadeContada, ...(obs ? { observacao: obs } : {}) },
    erro: null,
  };
}

// ── Resumo de um lote de reconciliacao (para o confirm do "reconciliar todos") ─

export interface ResumoLote {
  /** Total de itens elegiveis (divergentes ainda nao reconciliados) no conjunto. */
  total: number;
  entradas: number;
  saidas: number;
  transferencias: number;
  /** Itens que so serao carimbados (nao encontrado). */
  apuracoes: number;
}

/**
 * Resume o que um lote de reconciliacao vai aplicar, considerando SOMENTE os
 * itens divergentes ainda nao reconciliados. Alimenta o confirm do lote (mostra
 * o que sera aplicado antes de disparar). Puro.
 */
export function resumirLote(
  itens: ConferenciaItemDTO[],
  nomeLocal: (id: string | null) => string,
): ResumoLote {
  const resumo: ResumoLote = {
    total: 0,
    entradas: 0,
    saidas: 0,
    transferencias: 0,
    apuracoes: 0,
  };
  for (const item of itens) {
    if (itemReconciliado(item)) continue;
    const div = divergenciaDoItem(item);
    if (!div.divergente) continue;
    resumo.total += 1;
    const ajuste = descreverAjuste(item, nomeLocal);
    switch (ajuste.tipo) {
      case 'entrada':
        resumo.entradas += 1;
        break;
      case 'saida':
        resumo.saidas += 1;
        break;
      case 'transferencia':
        resumo.transferencias += 1;
        break;
      case 'apuracao':
        resumo.apuracoes += 1;
        break;
      default:
        break;
    }
  }
  return resumo;
}

/** Ids dos itens elegiveis a reconciliacao em lote (divergentes nao reconciliados). */
export function idsElegiveisLote(itens: ConferenciaItemDTO[]): string[] {
  return itens
    .filter((i) => !itemReconciliado(i) && divergenciaDoItem(i).divergente)
    .map((i) => i.id);
}

// ── Progresso da contagem ─────────────────────────────────────────────────────

export interface ProgressoContagem {
  contados: number;
  total: number;
  /** Percentual inteiro 0..100. */
  pct: number;
  texto: string;
}

export function progressoContagem(contados: number, total: number): ProgressoContagem {
  const pct = total > 0 ? Math.round((contados / total) * 100) : 0;
  return {
    contados,
    total,
    pct,
    texto: `${contados.toLocaleString('pt-BR')} de ${total.toLocaleString('pt-BR')} contados`,
  };
}
