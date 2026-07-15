/**
 * Unidade = 1 item fisico serializado. Tipo puro, espelha a tabela
 * `estoque_unidades` (migration 0057). Auto-descritiva: carrega seus proprios
 * identificadores e descricao denormalizada, com `materialId` opcional
 * (agrupamento no catalogo).
 */

import type { Estado } from './estado';
import type { Status } from './status-unidade';
import type { UnidadeFisica } from './local';

export interface Unidade {
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
  /** Data de aquisicao em ISO date ('YYYY-MM-DD') ou null. */
  dataAquisicao: string | null;
  observacao: string | null;
  chaveImport: string | null;
  criadoEm: Date;
  atualizadoEm: Date;
}

/** Dados para criar/editar uma unidade serializada. */
export interface UpsertUnidade {
  materialId?: string | null;
  codigo?: string | null;
  codigoSpaguas?: string | null;
  patDaee?: string | null;
  outrosPat?: string | null;
  numeroSerie?: string | null;
  helice?: string | null;
  descricao: string;
  marca?: string | null;
  modelo?: string | null;
  estado?: Estado | null;
  status?: Status;
  localId?: string | null;
  dataAquisicao?: string | null;
  observacao?: string | null;
  chaveImport?: string | null;
}

/** Filtros de listagem de serializados. Combinados com AND; ausencia = "qualquer". */
export interface FiltrosUnidade {
  /** Filtra pela unidade fisica (PENHA/ARARAQUARA) do local da unidade. */
  unidade?: UnidadeFisica;
  localId?: string;
  estado?: Estado;
  status?: Status;
  materialId?: string;
  /** Busca textual em serie/patrimonio/descricao. */
  busca?: string;
  pagina?: number;
  porPagina?: number;
}
