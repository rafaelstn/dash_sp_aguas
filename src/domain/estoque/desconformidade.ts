/**
 * Desconformidade da carga do estoque: aviso que o importador detectou e que
 * exige decisão humana (migration 0071). Tipo puro, sem I/O.
 *
 * Ciclo de vida: `aberta` -> `resolvida` | `ignorada`, e reabrir volta para
 * `aberta` limpando a decisão inteira (nota, unidade ligada, quem e quando).
 * Resolver e ignorar exigem nota. Quem decide vem sempre do auth, nunca do corpo.
 */

export type TipoDesconformidade =
  | 'item_sem_descricao'
  | 'chave_repetida'
  | 'identificador_repetido'
  | 'leitura_diferente_do_codigo'
  | 'descricao_suspeita'
  | 'quantidade_vazia'
  | 'coluna_sem_cabecalho';

export const TIPOS_DESCONFORMIDADE: readonly TipoDesconformidade[] = Object.freeze([
  'item_sem_descricao',
  'chave_repetida',
  'identificador_repetido',
  'leitura_diferente_do_codigo',
  'descricao_suspeita',
  'quantidade_vazia',
  'coluna_sem_cabecalho',
]);

export type StatusDesconformidade = 'aberta' | 'resolvida' | 'ignorada';

export const STATUS_DESCONFORMIDADE: readonly StatusDesconformidade[] = Object.freeze([
  'aberta',
  'resolvida',
  'ignorada',
]);

export const NOTA_DESCONFORMIDADE_MIN = 3;
export const NOTA_DESCONFORMIDADE_MAX = 500;

export interface Desconformidade {
  id: string;
  tipo: TipoDesconformidade;
  origem: string;
  aba: string | null;
  linha: number | null;
  detalhe: string;
  dados: Record<string, unknown>;
  status: StatusDesconformidade;
  nota: string | null;
  unidadeId: string | null;
  resolvidaPor: string | null;
  resolvidaEm: Date | null;
  detectadaEm: Date;
  ultimaDeteccaoEm: Date;
}

/** Forma pública da API: datas em ISO 8601. */
export interface DesconformidadeDTO {
  id: string;
  tipo: TipoDesconformidade;
  origem: string;
  aba: string | null;
  linha: number | null;
  detalhe: string;
  dados: Record<string, unknown>;
  status: StatusDesconformidade;
  nota: string | null;
  unidadeId: string | null;
  resolvidaPor: string | null;
  resolvidaEm: string | null;
  detectadaEm: string;
  ultimaDeteccaoEm: string;
}

export interface FiltrosDesconformidade {
  status?: StatusDesconformidade;
  tipo?: TipoDesconformidade;
  pagina: number;
  porPagina: number;
}

export type ContagemPorStatus = Record<StatusDesconformidade, number>;

export interface PaginaDesconformidades {
  itens: Desconformidade[];
  total: number;
  /** Ignora o filtro de status e respeita o de tipo. */
  contagem: ContagemPorStatus;
}

/** Pedido de decisão já validado na borda. */
export interface PedidoDecisao {
  status: StatusDesconformidade;
  nota?: string | null;
  unidadeId?: string | null;
}

/** Valores a gravar. `resolvidaEm` é carimbado por quem persiste. */
export interface DecisaoDesconformidade {
  status: StatusDesconformidade;
  nota: string | null;
  unidadeId: string | null;
  resolvidaPor: string | null;
}

export class DesconformidadeNaoEncontrada extends Error {
  constructor(public readonly id: string) {
    super('Desconformidade não encontrada.');
    this.name = 'DesconformidadeNaoEncontrada';
  }
}

/**
 * A decisão foi pedida sobre um status que já não é o do banco: outra pessoa
 * decidiu antes. Só existe quando quem chama informa o status que viu.
 */
export class DesconformidadeAlterada extends Error {
  constructor(
    public readonly id: string,
    public readonly esperado: StatusDesconformidade,
    public readonly encontrado: StatusDesconformidade,
  ) {
    super('Esta desconformidade foi alterada por outra pessoa. Atualize a lista.');
    this.name = 'DesconformidadeAlterada';
  }
}

export class DecisaoDesconformidadeInvalida extends Error {
  constructor(motivo: string) {
    super(motivo);
    this.name = 'DecisaoDesconformidadeInvalida';
  }
}

/**
 * Monta o que se grava a partir do pedido e de quem decide. Reabrir descarta
 * nota e unidade enviadas, porque `aberta` não carrega decisão (CHECK
 * `ck_estoque_desconf_aberta`). Resolver ou ignorar sem nota válida é recusado
 * aqui mesmo se a borda deixar passar.
 */
export function montarDecisao(pedido: PedidoDecisao, usuarioId: string): DecisaoDesconformidade {
  if (pedido.status === 'aberta') {
    return { status: 'aberta', nota: null, unidadeId: null, resolvidaPor: null };
  }
  const nota = (pedido.nota ?? '').trim();
  if (nota.length < NOTA_DESCONFORMIDADE_MIN || nota.length > NOTA_DESCONFORMIDADE_MAX) {
    throw new DecisaoDesconformidadeInvalida(
      `A nota é obrigatória para ${pedido.status === 'resolvida' ? 'resolver' : 'ignorar'} ` +
        `e deve ter de ${NOTA_DESCONFORMIDADE_MIN} a ${NOTA_DESCONFORMIDADE_MAX} caracteres.`,
    );
  }
  if (!usuarioId) throw new DecisaoDesconformidadeInvalida('Usuário da decisão ausente.');
  return {
    status: pedido.status,
    nota,
    unidadeId: pedido.unidadeId ?? null,
    resolvidaPor: usuarioId,
  };
}

export function desconformidadeParaDTO(d: Desconformidade): DesconformidadeDTO {
  return {
    id: d.id,
    tipo: d.tipo,
    origem: d.origem,
    aba: d.aba,
    linha: d.linha,
    detalhe: d.detalhe,
    dados: d.dados,
    status: d.status,
    nota: d.nota,
    unidadeId: d.unidadeId,
    resolvidaPor: d.resolvidaPor,
    resolvidaEm: d.resolvidaEm ? d.resolvidaEm.toISOString() : null,
    detectadaEm: d.detectadaEm.toISOString(),
    ultimaDeteccaoEm: d.ultimaDeteccaoEm.toISOString(),
  };
}

/** Ordem da listagem: aberta primeiro, depois tipo, aba e linha. */
export function compararDesconformidades(a: Desconformidade, b: Desconformidade): number {
  const abertaA = a.status === 'aberta' ? 0 : 1;
  const abertaB = b.status === 'aberta' ? 0 : 1;
  if (abertaA !== abertaB) return abertaA - abertaB;
  if (a.tipo !== b.tipo) return a.tipo < b.tipo ? -1 : 1;
  const abaA = a.aba ?? '￿';
  const abaB = b.aba ?? '￿';
  if (abaA !== abaB) return abaA < abaB ? -1 : 1;
  const linhaA = a.linha ?? 0;
  const linhaB = b.linha ?? 0;
  if (linhaA !== linhaB) return linhaA - linhaB;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
