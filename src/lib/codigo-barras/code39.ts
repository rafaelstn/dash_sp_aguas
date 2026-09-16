/**
 * Encoder de Code 39 (ISO/IEC 16388) em TypeScript puro: sem dependência, sem
 * rede, sem DOM. Devolve a geometria das barras em MÓDULOS inteiros; quem
 * desenha (SVG) só multiplica pela escala.
 *
 * Por que Code 39: as etiquetas já coladas pelo órgão foram lidas com leitor USB
 * e voltaram em maiúsculas (`001SPA26Arara` lido como `001SPA26ARARA`), que é o
 * comportamento do Code 39, cujo conjunto não tem minúsculas. Por isso o texto é
 * normalizado com `toUpperCase()` antes de codificar; a busca do sistema por
 * código é case-insensitive e acha o item de volta.
 *
 * Este é o ÚNICO ponto que conhece a simbologia. Se a etiqueta real mostrar
 * outra, troca-se este módulo mantendo o contrato `ResultadoCodigoBarras`.
 */

/**
 * Padrão de cada caractere: 9 elementos alternando barra e espaço, começando
 * por barra (b s b s b s b s b). `1` é elemento largo, `0` é estreito. Todo
 * caractere tem exatamente 3 largos.
 */
const PADROES: Readonly<Record<string, string>> = {
  '0': '000110100',
  '1': '100100001',
  '2': '001100001',
  '3': '101100000',
  '4': '000110001',
  '5': '100110000',
  '6': '001110000',
  '7': '000100101',
  '8': '100100100',
  '9': '001100100',
  A: '100001001',
  B: '001001001',
  C: '101001000',
  D: '000011001',
  E: '100011000',
  F: '001011000',
  G: '000001101',
  H: '100001100',
  I: '001001100',
  J: '000011100',
  K: '100000011',
  L: '001000011',
  M: '101000010',
  N: '000010011',
  O: '100010010',
  P: '001010010',
  Q: '000000111',
  R: '100000110',
  S: '001000110',
  T: '000010110',
  U: '110000001',
  V: '011000001',
  W: '111000000',
  X: '010010001',
  Y: '110010000',
  Z: '011010000',
  '-': '010000101',
  '.': '110000100',
  ' ': '011000100',
  $: '010101000',
  '/': '010100010',
  '+': '010001010',
  '%': '000101010',
  '*': '010010100',
};

/** Caractere de início e fim. Não pode aparecer no conteúdo. */
export const START_STOP_CODE39 = '*';

/**
 * Proporção largo:estreito. A norma aceita de 2:1 a 3:1 e exige no mínimo 2,2
 * quando o módulo é menor que 0,5 mm (caso da etiqueta). 3 é o mais tolerante
 * a impressão e leitura, e mantém o módulo inteiro.
 */
export const LARGURA_LARGO = 3;
export const LARGURA_ESTREITO = 1;
/** Espaço entre caracteres: um módulo estreito. */
export const GAP_ENTRE_CARACTERES = 1;
/** Zona quieta em cada lado, em módulos (a norma pede ao menos 10). */
export const ZONA_QUIETA_MODULOS = 10;

export interface BarraCodigo {
  /** Início da barra, em módulos, já contando a zona quieta. */
  x: number;
  /** Largura da barra, em módulos. */
  largura: number;
}

export type ResultadoCodigoBarras =
  | {
      ok: true;
      simbologia: 'code39';
      /** Texto efetivamente codificado (normalizado, sem os `*`). */
      texto: string;
      barras: BarraCodigo[];
      /** Largura total em módulos, zonas quietas incluídas. */
      larguraModulos: number;
    }
  | {
      ok: false;
      erro: 'vazio' | 'caractere_invalido';
      /** Primeiro caractere recusado, quando `caractere_invalido`. */
      caractere?: string;
    };

/** Padrão de 9 elementos de UM caractere, ou null fora do conjunto. */
export function padraoCode39(caractere: string): string | null {
  return Object.prototype.hasOwnProperty.call(PADROES, caractere)
    ? (PADROES[caractere] ?? null)
    : null;
}

/**
 * Codifica `texto` em Code 39 com start/stop, gap e zona quieta. Recusa texto
 * vazio e qualquer caractere fora do conjunto (inclusive `*` no conteúdo, que
 * seria lido como fim do símbolo). Não inventa nem remove caractere.
 */
export function codificarCode39(texto: string): ResultadoCodigoBarras {
  const normalizado = texto.trim().toUpperCase();
  if (normalizado.length === 0) return { ok: false, erro: 'vazio' };

  for (const c of normalizado) {
    if (c === START_STOP_CODE39 || padraoCode39(c) === null) {
      return { ok: false, erro: 'caractere_invalido', caractere: c };
    }
  }

  const simbolos = `${START_STOP_CODE39}${normalizado}${START_STOP_CODE39}`;
  const barras: BarraCodigo[] = [];
  let x = ZONA_QUIETA_MODULOS;

  [...simbolos].forEach((c, indice) => {
    if (indice > 0) x += GAP_ENTRE_CARACTERES;
    const padrao = PADROES[c] as string;
    for (let e = 0; e < padrao.length; e += 1) {
      const largura = padrao[e] === '1' ? LARGURA_LARGO : LARGURA_ESTREITO;
      if (e % 2 === 0) barras.push({ x, largura });
      x += largura;
    }
  });

  return {
    ok: true,
    simbologia: 'code39',
    texto: normalizado,
    barras,
    larguraModulos: x + ZONA_QUIETA_MODULOS,
  };
}
