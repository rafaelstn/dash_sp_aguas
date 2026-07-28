/**
 * Conferencia fisica (inventario) do estoque. Tipos PUROS e regras PURAS
 * (divergencia, maquinas de estado, mapeamento de reconciliacao). Espelha as
 * tabelas `estoque_conferencias` (0062) e `estoque_conferencia_itens` (0063).
 * Design: ADR 0021 e docs/arquitetura/estoque-conferencia.md.
 *
 * A validacao que depende do estado no banco (sessao aberta/concluida, escopo ja
 * em aberto, saldo, transicao) roda no repositorio/use-case dentro da transacao;
 * aqui vivem so as regras que NAO tocam I/O.
 */

import type { Natureza } from './material';
import type { UnidadeFisica } from './local';
import type { ComandoMovimentacao } from './movimentacao';

// ── Enums ─────────────────────────────────────────────────────────────────────

export type StatusConferencia = 'aberta' | 'concluida' | 'cancelada';
export const STATUS_CONFERENCIA: readonly StatusConferencia[] = Object.freeze([
  'aberta',
  'concluida',
  'cancelada',
]);

/** Natureza conferida pela sessao (single-natureza). Igual a `Natureza` do catalogo. */
export type NaturezaConferida = Natureza; // 'serializado' | 'quantificavel'

/** Situacao de contagem do SERIALIZADO (dimensao categorica do item). */
export type SituacaoItem =
  | 'pendente'
  | 'conferido'
  | 'nao_encontrado'
  | 'encontrado_em_outro_local';
export const SITUACOES_ITEM: readonly SituacaoItem[] = Object.freeze([
  'pendente',
  'conferido',
  'nao_encontrado',
  'encontrado_em_outro_local',
]);

/** Origem do item na conferencia: do snapshot congelado ou uma sobra adicionada. */
export type OrigemItem = 'snapshot' | 'sobra';

export function ehStatusConferencia(v: unknown): v is StatusConferencia {
  return v === 'aberta' || v === 'concluida' || v === 'cancelada';
}
export function ehSituacaoItem(v: unknown): v is SituacaoItem {
  return (
    v === 'pendente' ||
    v === 'conferido' ||
    v === 'nao_encontrado' ||
    v === 'encontrado_em_outro_local'
  );
}

// ── Entidades ─────────────────────────────────────────────────────────────────

export interface Conferencia {
  id: string;
  unidade: UnidadeFisica;
  natureza: NaturezaConferida;
  /** Escopo opcional por local; null = unidade fisica inteira. */
  localId: string | null;
  status: StatusConferencia;
  observacao: string | null;
  criadaPor: string;
  criadaEm: Date;
  concluidaPor: string | null;
  concluidaEm: Date | null;
  atualizadaEm: Date;
}

export interface ConferenciaItem {
  id: string;
  conferenciaId: string;
  /** XOR: serializado referencia unidade; quantificavel referencia material. */
  unidadeId: string | null;
  materialId: string | null;
  /** Contexto congelado no snapshot (local onde o sistema espera o item). */
  localEsperadoId: string | null;
  tamanho: string | null;
  origem: OrigemItem;
  /** Serializado: contagem categorica (null para quantificavel). */
  situacao: SituacaoItem | null;
  localEncontradoId: string | null;
  /** Quantificavel: quantidade congelada do sistema (null para serializado). */
  quantidadeSistema: number | null;
  quantidadeContada: number | null;
  /** GENERATED no banco: contada - sistema (null enquanto nao contado). */
  diferenca: number | null;
  observacao: string | null;
  movimentacaoId: string | null;
  reconciliadoPor: string | null;
  reconciliadoEm: Date | null;
  criadoEm: Date;
  atualizadoEm: Date;
}

// ── Maquina de estados da SESSAO ────────────────────────────────────────────────

const TRANSICOES_STATUS: ReadonlyMap<StatusConferencia, ReadonlySet<StatusConferencia>> =
  new Map([
    ['aberta', new Set<StatusConferencia>(['concluida', 'cancelada'])],
    // concluida e cancelada sao terminais no fluxo (reconciliacao acontece por item).
    ['concluida', new Set<StatusConferencia>()],
    ['cancelada', new Set<StatusConferencia>()],
  ]);

/**
 * Valida a transicao de status da sessao. Transicao para o mesmo status nao conta
 * (retorna false). Funcao pura.
 */
export function statusConferenciaValido(
  de: StatusConferencia,
  para: StatusConferencia,
): boolean {
  return TRANSICOES_STATUS.get(de)?.has(para) ?? false;
}

// ── Situacao do serializado (contagem categorica) ───────────────────────────────
//
// Nao ha funcao de transicao aqui: a contagem do serializado e livre entre as tres
// situacoes finais enquanto a sessao estiver aberta (reclassificar `nao_encontrado`
// -> `conferido` depois de achar o item e uso normal, e recontar a mesma situacao
// tem que ser idempotente). As duas unicas guardas reais sao o enum do schema, que
// nao aceita volta para `pendente`, e a exigencia de sessao `aberta` no repositorio.
// Existia aqui um `situacaoContagemValida` que ninguem chamava e que a arquitetura
// descrevia como a guarda efetiva; removido para o codigo e o documento contarem a
// mesma historia.

// ── Divergencia ─────────────────────────────────────────────────────────────────

export type TipoDivergencia =
  | 'nenhuma'
  | 'nao_contado'
  | 'sobra'
  | 'falta'
  | 'nao_encontrado'
  | 'outro_local';

export interface DivergenciaResultado {
  /** true quando ha divergencia a tratar (reconciliavel). */
  divergente: boolean;
  tipo: TipoDivergencia;
  /** Quantificavel: contada - sistema (null para serializado ou nao contado). */
  diferenca: number | null;
}

/**
 * Calcula a divergencia de um item. Puro.
 *
 * Quantificavel: `diferenca = contada - sistema`; `> 0` sobra, `< 0` falta,
 *   `= 0` nenhuma; `contada` null = nao_contado (ainda sem divergencia).
 * Serializado: categorica por `situacao`; `conferido`/`pendente` = sem
 *   divergencia; `nao_encontrado` e `encontrado_em_outro_local` = divergencia.
 */
export function calcularDivergencia(item: ConferenciaItem): DivergenciaResultado {
  if (item.materialId) {
    if (item.quantidadeContada === null) {
      return { divergente: false, tipo: 'nao_contado', diferenca: null };
    }
    const dif =
      item.diferenca ?? item.quantidadeContada - (item.quantidadeSistema ?? 0);
    if (dif > 0) return { divergente: true, tipo: 'sobra', diferenca: dif };
    if (dif < 0) return { divergente: true, tipo: 'falta', diferenca: dif };
    return { divergente: false, tipo: 'nenhuma', diferenca: 0 };
  }
  // serializado
  switch (item.situacao) {
    case 'nao_encontrado':
      return { divergente: true, tipo: 'nao_encontrado', diferenca: null };
    case 'encontrado_em_outro_local':
      return { divergente: true, tipo: 'outro_local', diferenca: null };
    case 'pendente':
      return { divergente: false, tipo: 'nao_contado', diferenca: null };
    default: // conferido (ou null defensivo)
      return { divergente: false, tipo: 'nenhuma', diferenca: null };
  }
}

// ── Mapeamento reconciliacao -> movimentacao ────────────────────────────────────

/**
 * Comando de movimentacao SEM o `usuarioId` (o repositorio injeta o auth do
 * backend). O `motivo` ja vem montado com o id curto da conferencia.
 */
export type ComandoReconciliacao = Omit<ComandoMovimentacao, 'usuarioId'>;

/** Motivo padrao da movimentacao gerada por reconciliacao. */
export function motivoReconciliacao(conferenciaId: string): string {
  return `Conferencia fisica #${conferenciaId.slice(0, 8)} (ajuste de inventario)`;
}

/**
 * Mapeia a divergencia de um item para a movimentacao que a reconcilia, ou `null`
 * quando NAO ha ajuste no estoque (sem divergencia, ou `nao_encontrado`, que e
 * apuracao manual e nunca vira baixa automatica). Puro. Ver tabela 4.1 da
 * arquitetura.
 *
 *  - Quantificavel `diferenca > 0` -> `entrada` de `diferenca` no local esperado.
 *  - Quantificavel `diferenca < 0` -> `saida` de `abs(diferenca)` do local esperado.
 *  - Serializado `encontrado_em_outro_local` -> `transferencia` esperado -> encontrado.
 *  - Demais casos (conferido, diferenca = 0, nao_encontrado, pendente/nao contado) -> null.
 */
export function resolverReconciliacao(item: ConferenciaItem): ComandoReconciliacao | null {
  const motivo = motivoReconciliacao(item.conferenciaId);

  // Quantificavel: ajuste por delta (entrada/saida), nunca `ajuste` (barrado no
  // dominio de movimentacao para quantificavel).
  if (item.materialId) {
    const dif = item.diferenca;
    if (dif === null || dif === 0) return null;
    if (dif > 0) {
      return {
        tipo: 'entrada',
        alvo: { natureza: 'quantificavel', materialId: item.materialId },
        quantidade: dif,
        localOrigemId: null,
        localDestinoId: item.localEsperadoId,
        tamanho: item.tamanho,
        motivo,
      };
    }
    return {
      tipo: 'saida',
      alvo: { natureza: 'quantificavel', materialId: item.materialId },
      quantidade: Math.abs(dif),
      localOrigemId: item.localEsperadoId,
      localDestinoId: null,
      tamanho: item.tamanho,
      motivo,
    };
  }

  // Serializado: so `encontrado_em_outro_local` gera movimentacao (transferencia).
  if (item.unidadeId && item.situacao === 'encontrado_em_outro_local') {
    return {
      tipo: 'transferencia',
      alvo: { natureza: 'serializado', unidadeId: item.unidadeId },
      quantidade: 1,
      localOrigemId: item.localEsperadoId,
      localDestinoId: item.localEncontradoId,
      tamanho: null,
      motivo,
    };
  }

  // conferido / nao_encontrado / pendente: so carimba, sem tocar o estoque.
  return null;
}

// ── Comandos de aplicacao (entrada dos ports) ───────────────────────────────────

/** Abrir uma sessao + snapshot congelado. `criadaPor` = auth do backend. */
export interface AbrirConferenciaComando {
  unidade: UnidadeFisica;
  natureza: NaturezaConferida;
  localId: string | null;
  observacao: string | null;
  criadaPor: string;
}

/** Filtros da listagem de sessoes. Combinados com AND. */
export interface FiltrosConferencia {
  unidade?: UnidadeFisica;
  natureza?: NaturezaConferida;
  status?: StatusConferencia;
  pagina?: number;
  porPagina?: number;
}

/** Filtros da listagem de itens de uma conferencia. */
export interface FiltrosItemConferencia {
  situacao?: SituacaoItem;
  apenasDivergentes?: boolean;
  apenasPendentesRecon?: boolean;
  pagina?: number;
  porPagina?: number;
}

/** Contagem normalizada aplicada a um item (validada contra a natureza da sessao). */
export type ContagemComando =
  | {
      tipo: 'serializado';
      situacao: Exclude<SituacaoItem, 'pendente'>;
      localEncontradoId: string | null;
      observacao: string | null;
    }
  | {
      tipo: 'quantificavel';
      quantidadeContada: number;
      observacao: string | null;
    };

/** Item "sobra" (contado fora do snapshot; alvo ja cadastrado). */
export type SobraComando =
  | { tipo: 'serializado'; unidadeId: string; localEncontradoId: string }
  | {
      tipo: 'quantificavel';
      materialId: string;
      localId: string;
      tamanho: string | null;
      quantidadeContada: number;
    };

/** Resultado de reconciliar 1 item. */
export interface ResultadoReconciliacao {
  item: ConferenciaItem;
  /** Movimentacao gerada, ou null quando so carimbou (sem tocar o estoque). */
  movimentacaoId: string | null;
  /** 'base_alterada' quando o saldo atual difere do congelado (governo: nunca em silencio). */
  aviso: 'base_alterada' | null;
  /** true quando o item ja estava reconciliado (no-op idempotente). */
  jaReconciliado: boolean;
}

/** Contagens agregadas para o resumo de divergencias da sessao. */
export interface ResumoDivergencias {
  totalItens: number;
  contados: number;
  naoContados: number;
  divergentes: number;
  reconciliados: number;
  /** Divergentes ainda sem carimbo de reconciliacao (pendencias de tratamento). */
  pendentesReconciliacao: number;
  porSituacao: Record<SituacaoItem, number>;
}
