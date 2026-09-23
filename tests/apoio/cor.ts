/**
 * Conversão de cor e contraste, para a régua que confere os tokens do
 * `globals.css`. Funções puras, sem leitura de arquivo: quem lê o CSS é a
 * régua, e o aparelho aqui se prova em `regua-de-cores-dos-tokens.test.ts`
 * contra valores que não dependem desta implementação (branco sobre preto é
 * 21:1 por definição da WCAG, e as cores nomeadas do Tailwind têm hexadecimal
 * publicado).
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/**
 * Qual par de canais recebe o croma em cada sexto do círculo de matiz.
 *
 * É um `switch` e não uma tabela indexada porque o índice sai de uma conta, e
 * indexar array com número sob `noUncheckedIndexedAccess` devolve
 * `undefined` no tipo: a tupla de três aqui é o que permite destruturar sem
 * afirmação de não-nulo, que é asserção de fé no meio de um aparelho de medida.
 */
function faixaDoSetor(setor: number, c: number, x: number): [number, number, number] {
  switch (setor) {
    case 0:
      return [c, x, 0];
    case 1:
      return [x, c, 0];
    case 2:
      return [0, c, x];
    case 3:
      return [0, x, c];
    case 4:
      return [x, 0, c];
    default:
      return [c, 0, x];
  }
}

/**
 * A mesma conta que o navegador faz para `hsl()`, em 0..255 por canal.
 *
 * Os canais são arredondados, e não truncados, porque é assim que o Chrome
 * resolve `hsl()` no computed style: foi comparando com o DOM renderizado que
 * se descobriu, em 23/09/2026, que o HSL escrito à mão no CSS não devolvia a
 * cor que o comentário ao lado declarava.
 */
export function hslParaRgb(h: number, s: number, l: number): Rgb {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r, g, b] = faixaDoSetor(Math.min(Math.floor(hp), 5), c, x);
  const m = ln - c / 2;
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

/** `#RRGGBB` (com ou sem `#`, caixa indiferente) para canais 0..255. */
export function hexParaRgb(hex: string): Rgb {
  const limpo = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(limpo)) {
    throw new Error(`hexadecimal fora do formato #RRGGBB: ${hex}`);
  }
  return {
    r: Number.parseInt(limpo.slice(0, 2), 16),
    g: Number.parseInt(limpo.slice(2, 4), 16),
    b: Number.parseInt(limpo.slice(4, 6), 16),
  };
}

export function rgbParaHex({ r, g, b }: Rgb): string {
  const dois = (v: number) => v.toString(16).padStart(2, '0').toUpperCase();
  return `#${dois(r)}${dois(g)}${dois(b)}`;
}

/** Maior diferença entre as duas cores, num único canal. */
export function deltaMaximo(a: Rgb, b: Rgb): number {
  return Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b));
}

/** Luminância relativa da WCAG 2.x (fórmula 2.4.3). */
export function luminancia({ r, g, b }: Rgb): number {
  const canal = (v: number) => {
    const n = v / 255;
    return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

/** Razão de contraste da WCAG, sempre >= 1. */
export function contraste(a: Rgb, b: Rgb): number {
  const la = luminancia(a);
  const lb = luminancia(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export interface TokenDeCor {
  /** Nome sem os dois hifens iniciais. */
  nome: string;
  /** Linha no arquivo, 1-indexada, para a mensagem de falha apontar onde. */
  linha: number;
  hsl: { h: number; s: number; l: number };
  /** Hexadecimal citado no comentário ao lado, já normalizado. */
  hexCitado: string;
  /** Ratios citados no comentário, na ordem em que aparecem. */
  ratiosCitados: number[];
  comentario: string;
}

const LINHA_DE_TOKEN =
  /^\s*--([a-z0-9-]+):\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*;\s*\/\*(.*?)\*\/\s*$/;
const HEX_NO_COMENTARIO = /#([0-9A-Fa-f]{6})\b/;
const RATIO_NO_COMENTARIO = /(\d+[.,]?\d*):1/g;

/**
 * Extrai os tokens de cor que declaram um hexadecimal no comentário ao lado.
 *
 * Só esses: um token sem hexadecimal citado não afirma nada que possa ser
 * conferido, e cobrar comentário de todos eles seria régua de forma, que
 * reprova o correto. Tokens fora do formato `--nome: H S% L%;` (como
 * `--ring: var(--gov-azul)` e as alturas de linha em px) não entram.
 */
export function tokensDeCor(css: string): TokenDeCor[] {
  const achados: TokenDeCor[] = [];
  css.split(/\r?\n/).forEach((linha, i) => {
    const m = LINHA_DE_TOKEN.exec(linha);
    if (!m) return;
    const [, nome, h, s, l, comentario] = m;
    // Quando a expressão casa, os cinco grupos existem; o guarda está aqui
    // porque o tipo não sabe disso, e porque uma alteração futura na expressão
    // que remova um grupo tem que parar de extrair, nunca extrair `undefined`.
    if (
      nome === undefined ||
      h === undefined ||
      s === undefined ||
      l === undefined ||
      comentario === undefined
    ) {
      return;
    }
    const hex = HEX_NO_COMENTARIO.exec(comentario)?.[1];
    if (hex === undefined) return;
    const ratios = [...comentario.matchAll(RATIO_NO_COMENTARIO)]
      .map((r) => r[1])
      .filter((bruto): bruto is string => bruto !== undefined)
      .map((bruto) => Number.parseFloat(bruto.replace(',', '.')));
    achados.push({
      nome,
      linha: i + 1,
      hsl: {
        h: Number.parseFloat(h),
        s: Number.parseFloat(s),
        l: Number.parseFloat(l),
      },
      hexCitado: `#${hex.toUpperCase()}`,
      ratiosCitados: ratios,
      comentario: comentario.trim(),
    });
  });
  return achados;
}
