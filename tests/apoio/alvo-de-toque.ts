/**
 * Altura de alvo de toque que um controle DECLARA nas suas classes.
 *
 * Por que não se mede renderizando: no jsdom não há layout, e o CSS do Tailwind
 * não é aplicado, de modo que `getBoundingClientRect()` devolve zero para tudo e
 * a regra `target-size` do axe está desligada de propósito em
 * `tests/apoio/acessibilidade.ts`. O único lugar onde a altura do alvo existe,
 * sem navegador, é a classe que o controle carrega.
 *
 * Então a leitura é da classe, mas a asserção é sobre o VALOR em pixels, e não
 * sobre a presença de um texto: `min-h-5` continua declarando altura e continua
 * reprovando, porque 20 px é menos que o mínimo.
 *
 * O que fica de fora de propósito: altura que vem de padding vertical mais a
 * entrelinha da fonte (`py-1.5 text-sm`, por exemplo). Somar os dois exige a
 * entrelinha, que sai do CSS e não está aqui; um controle assim devolve `null`,
 * que é "não declarou", e cabe a quem chama decidir. Nos controles que esta
 * régua julga, a altura é declarada de forma explícita justamente para a medição
 * não depender de fonte.
 */

/** Mínimo de alvo de toque em pixels, WCAG 2.2 SC 2.5.8 (nível AA). */
export const MINIMO_ALVO_PX = 24;

/** Um passo da escala de espaçamento do Tailwind vale 4 px (`h-11` = 44 px). */
const PASSO_PX = 4;

/** `h-11`, `min-h-6`, `md:min-h-9`, `h-3.5`, `min-h-[44px]`, `h-[2.75rem]`. */
const ALTURA = /(?:^|\s)(?:[a-z0-9-]+:)*(min-)?h-(\[[^\]\s]+\]|[0-9]+(?:\.[0-9]+)?|px)(?=\s|$)/g;

/** Converte o valor de uma classe de altura em pixels, ou `null` se não der. */
function emPixels(valor: string): number | null {
  if (valor === 'px') return 1;
  if (!valor.startsWith('[')) return Number(valor) * PASSO_PX;

  const cru = valor.slice(1, -1);
  const px = /^(-?[0-9]+(?:\.[0-9]+)?)px$/.exec(cru);
  if (px?.[1]) return Number(px[1]);
  const rem = /^(-?[0-9]+(?:\.[0-9]+)?)rem$/.exec(cru);
  if (rem?.[1]) return Number(rem[1]) * 16;
  // `calc(...)`, `100dvh`, `full`, `screen`: não é decidível aqui.
  return null;
}

/**
 * A MENOR altura que as classes declaram, em pixels, ou `null` se não declaram.
 *
 * A menor, e não a primeira: `min-h-11 md:min-h-6` é 44 px no celular e 24 px no
 * desktop, e o alvo pequeno demais estaria justamente no breakpoint esquecido.
 * Quem passa a largura de tela no `md:` é quem decide onde cada valor vale; a
 * régua cobra o pior caso, que é o que uma pessoa real encontra em alguma tela.
 */
export function alturaDeToqueDeclarada(classes: string): number | null {
  let menor: number | null = null;
  for (const casou of ` ${classes} `.matchAll(ALTURA)) {
    const px = emPixels(casou[2] as string);
    if (px === null) continue;
    if (menor === null || px < menor) menor = px;
  }
  return menor;
}
