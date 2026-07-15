/**
 * Material = catalogo ("o que e") das duas naturezas. Tipo puro, espelha a
 * tabela `estoque_materiais` (migration 0056).
 */

export type Natureza = 'serializado' | 'quantificavel';

export const NATUREZAS: readonly Natureza[] = Object.freeze([
  'serializado',
  'quantificavel',
]);

export function ehNatureza(valor: unknown): valor is Natureza {
  return valor === 'serializado' || valor === 'quantificavel';
}

export interface Material {
  id: string;
  descricao: string;
  marca: string | null;
  modelo: string | null;
  natureza: Natureza;
  unidadeMedida: string | null;
  categoriaId: string | null;
  /**
   * Nivel de reposicao (estoque minimo). NULL = sem minimo definido (nao dispara
   * alerta). So faz sentido em quantificavel; em serializado fica NULL e e
   * ignorado. Regra de "abaixo do minimo": ver `abaixoDoMinimo` em `reposicao.ts`.
   */
  quantidadeMinima: number | null;
  ativo: boolean;
  criadoEm: Date;
  atualizadoEm: Date;
}

/** Dados para criar/editar material. */
export interface UpsertMaterial {
  descricao: string;
  marca?: string | null;
  modelo?: string | null;
  natureza: Natureza;
  unidadeMedida?: string | null;
  categoriaId?: string | null;
  /** Nivel de reposicao; null limpa o minimo. Ver `reposicao.ts`. */
  quantidadeMinima?: number | null;
  ativo?: boolean;
}

/** Filtros de listagem do catalogo. Combinados com AND; ausencia = "qualquer". */
export interface FiltrosMaterial {
  natureza?: Natureza;
  categoriaId?: string;
  /** Busca textual em descricao/marca/modelo. */
  busca?: string;
  /** Quando true, retorna so `ativo=true`. Default do repositorio: todos. */
  apenasAtivos?: boolean;
  pagina?: number;
  porPagina?: number;
}
