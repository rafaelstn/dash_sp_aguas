/**
 * Conversão entre número e texto no formato pt-BR (vírgula decimal, ponto de
 * milhar). Centraliza o parsing/formatação antes reimplementado em
 * `FormularioFichaMobile`, `DialogEditarElemento` e `CampoFichaMobile`.
 */

/**
 * Converte texto pt-BR em número. Aceita "1.234,56", "1234,56" e "1234.56".
 *
 * Heurística: havendo vírgula, ela é o separador decimal e os pontos são
 * milhar (removidos); sem vírgula, um ponto é tratado como separador decimal.
 * Retorna `NaN` para texto vazio ou não numérico.
 */
export function parseNumeroPtBR(texto: string): number {
  const limpo = texto.trim();
  if (!limpo) return Number.NaN;
  if (limpo.includes(',')) {
    return Number(limpo.replace(/\./g, '').replace(',', '.'));
  }
  return Number(limpo);
}

/**
 * Igual a {@link parseNumeroPtBR}, mas devolve `null` (em vez de `NaN`) para
 * texto vazio ou inválido. Útil em campos opcionais.
 */
export function parseNumeroPtBROuNull(texto: string): number | null {
  const n = parseNumeroPtBR(texto);
  return Number.isFinite(n) ? n : null;
}

/**
 * Formata número como texto pt-BR simples, trocando o ponto decimal por
 * vírgula (sem separador de milhar). Ex.: `1.5` → `"1,5"`.
 */
export function numeroPtBRParaTexto(n: number): string {
  return String(n).replace('.', ',');
}
