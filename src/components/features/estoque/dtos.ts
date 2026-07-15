/**
 * DTOs do modulo Estoque no lado do navegador. Espelham os tipos puros do
 * dominio, mas com as datas como STRING ISO (o JSON da API serializa `Date`
 * como texto). Manter separado dos tipos do dominio evita tratar string como
 * `Date` por engano ao formatar na tela.
 */

import type { Natureza } from '@/domain/estoque/material';
import type { Estado } from '@/domain/estoque/estado';
import type { Status } from '@/domain/estoque/status-unidade';
import type { UnidadeFisica } from '@/domain/estoque/local';
import type { TipoMovimentacao } from '@/domain/estoque/movimentacao';

export type { Natureza, Estado, Status, UnidadeFisica, TipoMovimentacao };

/** Resposta paginada padrao das listagens. */
export interface RespostaPaginada<T> {
  itens: T[];
  total: number;
  pagina: number;
  porPagina: number;
}

/** Resposta das consultas nao paginadas (locais, categorias, saldos). */
export interface RespostaLista<T> {
  itens: T[];
  total: number;
}

export interface MaterialDTO {
  id: string;
  descricao: string;
  marca: string | null;
  modelo: string | null;
  natureza: Natureza;
  unidadeMedida: string | null;
  categoriaId: string | null;
  /**
   * Nivel de reposicao (estoque minimo). null = sem minimo (nao alerta). So faz
   * sentido em quantificavel. Para marcar "abaixo do minimo" na tela, cruzar com
   * o saldo total agrupado do material e usar `abaixoDoMinimo` (domain/reposicao).
   */
  quantidadeMinima: number | null;
  ativo: boolean;
  criadoEm: string;
  atualizadoEm: string;
}

export interface UnidadeDTO {
  id: string;
  materialId: string | null;
  codigo: string | null;
  codigoSpaguas: string | null;
  patDaee: string | null;
  outrosPat: string | null;
  numeroSerie: string | null;
  helice: string | null;
  descricao: string;
  marca: string | null;
  modelo: string | null;
  estado: Estado | null;
  status: Status;
  localId: string | null;
  dataAquisicao: string | null;
  observacao: string | null;
  chaveImport: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

export interface LocalDTO {
  id: string;
  unidade: UnidadeFisica;
  sala: string | null;
  prateleira: string | null;
  armario: string | null;
  rotulo: string;
  observacao: string | null;
  criadoEm: string;
}

export interface CategoriaDTO {
  id: string;
  nome: string;
  criadoEm: string;
}

export interface SaldoContextoDTO {
  id: string;
  materialId: string;
  localId: string;
  quantidade: number;
  tamanho: string | null;
  atualizadoEm: string;
  materialDescricao: string;
  localRotulo: string;
  unidade: UnidadeFisica;
}

export interface MovimentacaoDTO {
  id: string;
  tipo: TipoMovimentacao;
  unidadeId: string | null;
  materialId: string | null;
  quantidade: number;
  localOrigemId: string | null;
  localDestinoId: string | null;
  estadoAnterior: Estado | null;
  estadoNovo: Estado | null;
  statusAnterior: Status | null;
  statusNovo: Status | null;
  motivo: string | null;
  usuarioId: string;
  criadoEm: string;
}

/**
 * Movimentacao enriquecida para a TRILHA de auditoria (listagem
 * `GET /api/estoque/movimentacoes` e historico do detalhe do item). Alem dos
 * campos do ledger, traz `operador`: o rotulo legivel de quem fez o evento
 * (nome; senao email; senao o id; "Importação" para a carga inicial), resolvido
 * no servidor pela MESMA regra do export. So a trilha usa este DTO; o resultado
 * do POST continua em `MovimentacaoDTO` (sem operador).
 */
export interface MovimentacaoTrilhaDTO extends MovimentacaoDTO {
  operador: string;
}

export interface ResultadoMovimentacaoDTO {
  movimentacao: MovimentacaoDTO;
  saldo: {
    id: string;
    materialId: string;
    localId: string;
    quantidade: number;
    tamanho: string | null;
    atualizadoEm: string;
  } | null;
  unidade: UnidadeDTO | null;
}

/** Detalhe de unidade serializada: registro + trilha de movimentacao. */
export interface DetalheUnidadeDTO {
  unidade: UnidadeDTO;
  historico: MovimentacaoTrilhaDTO[];
}
