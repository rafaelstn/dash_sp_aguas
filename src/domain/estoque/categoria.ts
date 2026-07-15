/**
 * Categoria = classificacao opcional do catalogo. Tipo puro, espelha a tabela
 * `estoque_categorias` (migration 0055).
 */

export interface Categoria {
  id: string;
  nome: string;
  criadoEm: Date;
}

/** Dados para criar/editar categoria. */
export interface UpsertCategoria {
  nome: string;
}
