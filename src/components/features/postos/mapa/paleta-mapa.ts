/**
 * As cores do mapa, uma vez só, com o token de onde cada uma sai.
 *
 * Por que existe: o mapa desenha em CANVAS, e `ctx.fillStyle` não resolve
 * `var(--posto-plu)`. Antes de 05/10/2026 isso virava hexadecimal espalhado
 * pelos arquivos do mapa (19 ocorrências, medidas com
 * `grep -roE '#[0-9A-Fa-f]{6}\b' src/components/features/postos/mapa/`), e a
 * cor do mapa passou a ser uma segunda fonte de verdade, fora do `globals.css`
 * e fora da régua de contraste que mede os tokens.
 *
 * O conserto não é esconder o hexadecimal num arquivo só: é fazer com que
 * divergir REPROVE. Cada entrada aqui carrega o nome do token, e
 * `tests/unit/componentes/paleta-do-mapa.test.ts` lê o `globals.css` e confere
 * que o HSL declarado lá renderiza exatamente este hexadecimal. Mudar a cor no
 * CSS sem mudar aqui (ou o contrário) falha a suíte, que é o comportamento que
 * eu queria e que duas listas à mão não dão.
 *
 * Quem desenha em CSS ou em SVG não usa este módulo: usa o utilitário do
 * Tailwind (`text-mapa-rotulo`, `fill-posto-plu`) ou `hsl(var(--token))`
 * direto, que é o caminho normal e acompanha tema futuro.
 */

/** Par `[token, hexadecimal]`. O token é a fonte; o hexadecimal é a cópia que a régua confere. */
type Entrada = readonly [token: string, hex: string];

export const TOKENS_DO_MAPA = {
  /* Fundo desenhado */
  fora: ['--mapa-fora', '#DCE3EC'],
  terra: ['--bg-surface', '#FFFFFF'],
  divisa: ['--mapa-divisa', '#8296B0'],
  rotulo: ['--mapa-rotulo', '#3F5579'],
  contorno: ['--gov-azul-escuro', '#1E3A8A'],
  selecao: ['--gov-azul', '#1E40AF'],
  selecaoFundo: ['--gov-azul-claro', '#DBEAFE'],
  /* Símbolos */
  realce: ['--fg-default', '#111827'],
  plu: ['--posto-plu', '#2563A8'],
  flu: ['--posto-flu', '#0E8A6A'],
  piezo: ['--posto-piezo', '#C2410C'],
  meteo: ['--posto-meteo', '#4B5563'],
  indefinido: ['--posto-indefinido', '#6B7280'],
  outrasRedes: ['--mapa-outras-redes', '#6B7280'],
} as const satisfies Readonly<Record<string, Entrada>>;

/**
 * Só os hexadecimais, para o canvas e para `fill` de SVG.
 *
 * Derivado da tabela acima em vez de escrito ao lado dela: lista copiada à mão
 * é lista que diverge.
 */
export const COR = Object.fromEntries(
  Object.entries(TOKENS_DO_MAPA).map(([nome, [, hex]]) => [nome, hex]),
) as { readonly [K in keyof typeof TOKENS_DO_MAPA]: string };

/** `rgba()` do mesmo hexadecimal, para o canvas, que não aceita `#RRGGBB` com alfa em todo navegador. */
export function comAlfa(hex: string, alfa: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alfa})`;
}
