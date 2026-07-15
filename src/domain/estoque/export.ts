/**
 * Regras PURAS da exportacao do Estoque (sem I/O, sem exceljs). Define os tipos
 * enriquecidos que os repositorios devolvem para o export, os rotulos legiveis
 * (estado/status/tipo/natureza, com acento correto no texto visivel) e as
 * funcoes que transformam um registro numa linha do xlsx. O use-case
 * (`application/use-cases/estoque/exportar-estoque`) so monta o workbook a partir
 * daqui; assim a logica de rotulo/linha e testavel sem gerar binario.
 */

import type { Estado } from './estado';
import type { Status } from './status-unidade';
import type { UnidadeFisica } from './local';
import type { Unidade } from './unidade';
import type { Movimentacao, TipoMovimentacao } from './movimentacao';

/**
 * Teto defensivo de linhas por export (sem paginacao). O inventario atual tem
 * ~800 itens; 50k e folga larga. O repositorio corta em TETO_EXPORT e o
 * use-case sinaliza `truncado` para o log quando o corte pode ter acontecido.
 */
export const TETO_EXPORT = 50_000;

/**
 * UUID de sistema usado pela carga inicial (scripts/estoque/importar-inventario.mjs).
 * A coluna `usuario_id` do ledger NAO tem FK para auth.users (migration 0059),
 * entao esse id nao resolve identidade: no export vira "Importacao".
 */
export const UUID_SISTEMA_IMPORT = '00000000-0000-0000-0000-000000000000';

/** Identidade minima de um operador, resolvida de auth.users (email/nome). */
export interface IdentidadeUsuario {
  email: string | null;
  nome: string | null;
}

/** Unidade serializada + contexto do local (unidade fisica + rotulo) p/ export. */
export interface UnidadeExport extends Unidade {
  unidadeFisica: UnidadeFisica | null;
  localRotulo: string | null;
}

/** Uma linha de saldo de quantificavel enriquecida para o export. */
export interface SaldoExport {
  materialDescricao: string;
  marca: string | null;
  modelo: string | null;
  categoria: string | null;
  unidadeFisica: UnidadeFisica;
  localRotulo: string;
  tamanho: string | null;
  quantidade: number;
}

/**
 * Movimentacao + contexto (descricao/identificacao do item, rotulos dos locais)
 * para o export. O OPERADOR e resolvido a parte (batch em auth.users) e passado
 * a `linhaMovimentacao`, mantendo este tipo desacoplado da identidade.
 */
export interface MovimentacaoExport extends Movimentacao {
  itemDescricao: string | null;
  /** Patrimonio/serie do serializado (COALESCE pat/serie/codigo). null p/ material. */
  itemIdentificacao: string | null;
  localOrigemRotulo: string | null;
  localDestinoRotulo: string | null;
}

/** Celula do xlsx: texto ou numero (datas ja vao formatadas como texto). */
export type CelulaExport = string | number;

const NAO_INFORMADO = 'Não informado';

function capitalizar(s: string): string {
  return s.length === 0 ? s : s[0]!.toUpperCase() + s.slice(1);
}

/** Estado fisico capitalizado; "Não informado" quando nulo. */
export function rotuloEstado(estado: Estado | null): string {
  return estado ? capitalizar(estado) : NAO_INFORMADO;
}

/** Situacao (status) capitalizada; "Não informado" quando nula (defensivo). */
export function rotuloStatus(status: Status | null): string {
  return status ? capitalizar(status) : NAO_INFORMADO;
}

/** Rotulos de tipo com acento correto (texto visivel). */
const ROTULO_TIPO: Record<TipoMovimentacao, string> = {
  entrada: 'Entrada',
  saida: 'Saída',
  transferencia: 'Transferência',
  baixa: 'Baixa',
  ajuste: 'Ajuste',
};

export function rotuloTipoMov(tipo: TipoMovimentacao): string {
  return ROTULO_TIPO[tipo];
}

/** Natureza derivada do alvo do registro (serializado tem unidadeId). */
export function rotuloNatureza(m: Pick<Movimentacao, 'unidadeId'>): string {
  return m.unidadeId ? 'Serializado' : 'Quantificável';
}

// Formatador deterministico (timezone explicito): 'YYYY-MM-DD HH:mm' na hora de
// Sao Paulo, independente do TZ da maquina. Usa formatToParts para nao depender
// do separador de locale.
const FMT_DATA_HORA = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function formatarDataHora(d: Date): string {
  const p = Object.fromEntries(
    FMT_DATA_HORA.formatToParts(d).map((x) => [x.type, x.value]),
  ) as Record<string, string>;
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/**
 * Transicao "anterior -> novo" (seta em notacao de dado, nao prosa). Vazio
 * quando nao houve mudanca (anterior == novo, incluindo ambos nulos). Usado nas
 * colunas Estado/Situacao da trilha.
 */
export function rotuloTransicaoEstado(ant: Estado | null, novo: Estado | null): string {
  if (ant === novo) return '';
  return `${rotuloEstado(ant)} -> ${rotuloEstado(novo)}`;
}

export function rotuloTransicaoStatus(ant: Status | null, novo: Status | null): string {
  if (ant === novo) return '';
  return `${rotuloStatus(ant)} -> ${rotuloStatus(novo)}`;
}

/** Item legivel da trilha: serializado = "descricao (patrimonio)"; material = descricao. */
export function rotuloItem(m: MovimentacaoExport): string {
  const desc = m.itemDescricao ?? '';
  if (m.unidadeId && m.itemIdentificacao) {
    return desc ? `${desc} (${m.itemIdentificacao})` : `(${m.itemIdentificacao})`;
  }
  return desc;
}

/**
 * Rotulo do operador a partir do id e da identidade resolvida (email/nome).
 * Precedencia: UUID de sistema -> "Importacao"; nome; email; senao o id cru
 * (gap sinalizado, nao inventa). Funcao pura.
 */
export function rotuloOperador(id: string, identidade: IdentidadeUsuario | undefined): string {
  if (id === UUID_SISTEMA_IMPORT) return 'Importação';
  const nome = identidade?.nome?.trim();
  if (nome) return nome;
  const email = identidade?.email?.trim();
  if (email) return email;
  return id;
}

/**
 * Mapa `usuarioId -> rotulo do operador` para um conjunto de ids, dado o mapa de
 * identidades JA resolvido em lote. Puro. Deduplica os ids e roteia cada um por
 * `rotuloOperador` (UUID de import -> "Importação"; nome; email; senao o id cru).
 * Fonte unica da regra de rotulo para as duas superficies (trilha e export), pra
 * o nome do operador nunca divergir entre listagem/detalhe e planilha.
 */
export function mapaOperadores(
  usuarioIds: Iterable<string>,
  identidades: Map<string, IdentidadeUsuario>,
): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const id of usuarioIds) {
    if (!mapa.has(id)) mapa.set(id, rotuloOperador(id, identidades.get(id)));
  }
  return mapa;
}

// ── Cabecalhos (texto visivel, acento PT-BR correto) ─────────────────────────

export const CABECALHO_SERIALIZADO: readonly string[] = [
  'Descrição',
  'Marca',
  'Modelo',
  'Código',
  'Código SP Águas (lote)',
  'Patrimônio DAEE',
  'Outros Pat.',
  'Número de Série/IMEI',
  'Hélice',
  'Unidade',
  'Local',
  'Estado',
  'Situação',
  'Data de aquisição',
  'Observação',
];

export const CABECALHO_QUANTIFICAVEL: readonly string[] = [
  'Material',
  'Marca',
  'Modelo',
  'Categoria',
  'Unidade',
  'Local',
  'Tamanho',
  'Quantidade',
];

export const CABECALHO_MOVIMENTACAO: readonly string[] = [
  'Data',
  'Tipo',
  'Natureza',
  'Item',
  'Quantidade',
  'Local de origem',
  'Local de destino',
  'Estado',
  'Situação',
  'Motivo',
  'Operador',
];

// ── Transformacao registro -> linha do xlsx (texto nulo vira celula vazia) ────

export function linhaSerializado(u: UnidadeExport): CelulaExport[] {
  return [
    u.descricao,
    u.marca ?? '',
    u.modelo ?? '',
    u.codigo ?? '',
    u.codigoSpaguas ?? '',
    u.patDaee ?? '',
    u.outrosPat ?? '',
    u.numeroSerie ?? '',
    u.helice ?? '',
    u.unidadeFisica ?? '',
    u.localRotulo ?? '',
    rotuloEstado(u.estado),
    rotuloStatus(u.status),
    u.dataAquisicao ?? '',
    u.observacao ?? '',
  ];
}

export function linhaQuantificavel(s: SaldoExport): CelulaExport[] {
  return [
    s.materialDescricao,
    s.marca ?? '',
    s.modelo ?? '',
    s.categoria ?? '',
    s.unidadeFisica,
    s.localRotulo,
    s.tamanho ?? '',
    s.quantidade,
  ];
}

export function linhaMovimentacao(m: MovimentacaoExport, operadorRotulo: string): CelulaExport[] {
  return [
    formatarDataHora(m.criadoEm),
    rotuloTipoMov(m.tipo),
    rotuloNatureza(m),
    rotuloItem(m),
    m.quantidade,
    m.localOrigemRotulo ?? '',
    m.localDestinoRotulo ?? '',
    rotuloTransicaoEstado(m.estadoAnterior, m.estadoNovo),
    rotuloTransicaoStatus(m.statusAnterior, m.statusNovo),
    m.motivo ?? '',
    operadorRotulo,
  ];
}
