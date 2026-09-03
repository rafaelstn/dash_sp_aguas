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
  /**
   * Mantenedores — o campo `mantenedor` (no `Dbfch`, a entidade OPERADORA).
   *
   * Combinava também `btl` até 03/09/2026, quando aquele campo saiu do domínio
   * por não ter origem no banco do órgão. Toda faceta oferecida precisa devolver
   * resultado na busca, e `pesquisar` não casa mais `btl`: continuar listando
   * esses valores criaria opção clicável que devolve zero. Total conta postos
   * distintos.
   */
  mantenedores: Array<{ nome: string; total: number }>;
}

export interface FacetasRepository {
  listar(): Promise<FacetasPostos>;
}
