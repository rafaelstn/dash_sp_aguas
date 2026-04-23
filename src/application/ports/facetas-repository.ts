/**
 * Facetas disponíveis para filtrar a busca na home.
 * Valores únicos extraídos do cadastro `postos` — cache trivial porque o
 * dataset muda raramente (importer uma vez).
 */
export interface FacetasPostos {
  ugrhis: Array<{ numero: string; nome: string; total: number }>;
  municipios: Array<{ nome: string; total: number }>;
  bacias: Array<{ nome: string; total: number }>;
  tiposPosto: Array<{ codigo: string; total: number }>;
}

export interface FacetasRepository {
  listar(): Promise<FacetasPostos>;
}
