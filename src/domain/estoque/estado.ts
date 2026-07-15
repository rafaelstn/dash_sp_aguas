/**
 * Estado = condicao fisica observada de uma unidade serializada. Atributo da
 * unidade (nao ciclo de vida; esse e `status`). Pode ser `null` quando a
 * planilha nao informou. Espelha o CHECK da coluna `estado` (migration 0057).
 *
 * Tipo puro, sem I/O. O de-para de texto livre -> enum (`mapearEstado`) vive
 * aqui e e reutilizado pelo import e por qualquer edicao. O texto bruto original
 * SEMPRE e preservado em `observacao`; o enum e derivado, nao substitui.
 */

export type Estado = 'novo' | 'bom' | 'usado' | 'defeito' | 'sucata';

export const ESTADOS: readonly Estado[] = Object.freeze([
  'novo',
  'bom',
  'usado',
  'defeito',
  'sucata',
]);

/** Guarda de entrada nao confiavel. */
export function ehEstadoValido(valor: unknown): valor is Estado {
  return (
    valor === 'novo' ||
    valor === 'bom' ||
    valor === 'usado' ||
    valor === 'defeito' ||
    valor === 'sucata'
  );
}

/**
 * Normaliza texto livre para comparacao: remove acento, caixa alta, colapsa
 * qualquer nao-alfanumerico em espaco unico, trim. "Com Defeito!" -> "COM DEFEITO".
 */
export function normalizarTextoEstado(bruto: string): string {
  return bruto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '') // remove diacriticos combinantes (sem literal fragil no fonte)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

// Regras de de-para em ORDEM DE PRECEDENCIA (do mais especifico/grave ao mais
// leve). "COM DEFEITO" precisa cair em `defeito` antes de casar `bom`; por isso
// defeito/sucata vem antes de novo/bom/usado. Frases com espaco casam por
// substring; tokens curtos (OK, BOM) casam por palavra inteira (evita falso
// positivo dentro de outra palavra).
const REGRAS: ReadonlyArray<readonly [Estado, readonly string[]]> = [
  ['sucata', ['SUCATA', 'INSERVIVEL', 'IMPRESTAVEL']],
  ['defeito', ['COM DEFEITO', 'DEFEITO', 'COM PROBLEMA', 'QUEIMADO', 'NAO FUNCIONA']],
  ['novo', ['NA CAIXA', 'NOVO', 'NOVA', 'LACRADO', 'VEDADO']],
  ['bom', ['PERFEITO', 'OTIMO', 'BOA', 'BOM', 'OK']],
  ['usado', ['USADO', 'USADA', 'REGULAR', 'DUVIDOSO']],
];

/**
 * De-para de texto de OBSERVACAO -> enum `Estado`. Case-insensitive, sem acento.
 * Retorna `null` quando vazio, "?" ou sem correspondencia (nao classificado; o
 * bruto continua preservado em `observacao` pelo chamador). Funcao pura.
 */
export function mapearEstado(bruto: string | null | undefined): Estado | null {
  if (bruto === null || bruto === undefined) return null;
  const norm = normalizarTextoEstado(bruto);
  if (norm === '' || norm === '?') return null;
  const tokens = norm.split(' ');

  for (const [estado, palavras] of REGRAS) {
    for (const palavra of palavras) {
      if (palavra.includes(' ')) {
        if (norm.includes(palavra)) return estado;
      } else if (tokens.includes(palavra)) {
        return estado;
      }
    }
  }
  return null;
}
