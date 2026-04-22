/**
 * Normalização de texto consistente no frontend.
 * Unaccent real no matching server-side fica a cargo da extensão `unaccent` do PG.
 */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}
