/**
 * Apoio de acessibilidade para os testes `.test.tsx`.
 *
 * O que esta camada mede, e o que ela NÃO mede.
 *
 * O axe roda sobre o DOM que o jsdom montou, e o jsdom não faz layout: não há
 * largura, não há pintura e não há cor computada de verdade. Por isso as regras
 * que dependem de pixel ficam desligadas aqui, e desligadas de propósito, com o
 * nome escrito: elas não reprovariam nada e dariam verde falso, que é pior que
 * silêncio. Contraste, alvo de toque e ordem visual continuam sendo prova de
 * navegador, e neste projeto continuam sendo conferidos à mão pelo checklist do
 * `padrao-ui.md`.
 *
 * O que ela mede de verdade é a árvore de acessibilidade: nome acessível,
 * papel, rótulo de controle, hierarquia de títulos, atributo `aria-*` inválido,
 * `id` duplicado e ordem de foco declarada. É exatamente a classe de defeito
 * que o QA de 22/09/2026 achou lendo o JSX à mão.
 */
import axe from 'axe-core';

/** Regras que o jsdom não consegue avaliar, com o motivo de cada uma. */
const REGRAS_SEM_LAYOUT: Record<string, { enabled: false }> = {
  // Precisa de cor computada e de pintura. No jsdom o axe devolve
  // "incomplete", que não reprova nada.
  'color-contrast': { enabled: false },
  // Precisa de caixa com largura e altura reais.
  'target-size': { enabled: false },
};

export type Violacao = {
  id: string;
  impacto: string;
  descricao: string;
  alvos: string[];
};

/**
 * Roda o axe no elemento e devolve as violações em formato curto e legível.
 *
 * O retorno é uma lista de strings porque é assim que a reprovação fica útil no
 * terminal: o `expect(...).toEqual([])` imprime o que apareceu, com o seletor
 * do elemento culpado, e não só "esperava true".
 */
export async function violacoes(
  elemento: Element,
  regrasExtras: Record<string, { enabled: boolean }> = {},
): Promise<Violacao[]> {
  const resultado = await axe.run(elemento, {
    rules: { ...REGRAS_SEM_LAYOUT, ...regrasExtras },
    resultTypes: ['violations'],
  });
  return resultado.violations.map((v) => ({
    id: v.id,
    impacto: v.impact ?? 'indefinido',
    descricao: v.help,
    alvos: v.nodes.map((n) => n.target.join(' ')),
  }));
}

/** As violações em uma linha cada, para entrar direto no `expect`. */
export async function violacoesEmLinha(
  elemento: Element,
  regrasExtras?: Record<string, { enabled: boolean }>,
): Promise<string[]> {
  return (await violacoes(elemento, regrasExtras)).map(
    (v) => `${v.id} (${v.impacto}) em ${v.alvos.join(', ')}: ${v.descricao}`,
  );
}

/**
 * Níveis dos títulos do elemento, na ordem do documento.
 *
 * Serve para o caso de hierarquia: o axe tem a regra `heading-order`, mas ela
 * só olha o salto entre títulos adjacentes e não diz se a página tem um `h1`.
 */
export function niveisDosTitulos(elemento: Element): number[] {
  return Array.from(elemento.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(
    (t) => Number(t.tagName.slice(1)),
  );
}
