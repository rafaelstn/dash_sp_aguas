/**
 * Paleta de cores da COMPARAÇÃO multi-estação do Monitor.
 *
 * Decisão (fase de comparação): a cor de cada série de comparação é atribuída
 * pelo ÍNDICE da estação na cesta (não pela entidade responsável, como faz a
 * paleta do mapa). Isso garante cores bem distintas entre as estações comparadas
 * mesmo quando elas pertencem à mesma entidade.
 *
 * A paleta é idêntica à do painel oficial (sao-paulo-rain-map,
 * src/utils/stationColors.ts: COMPARISON_COLORS / getComparisonColor) para
 * manter a fidelidade visual com o protótipo.
 *
 * Hex literais (NÃO classes Tailwind): o recharts desenha em SVG fora do fluxo
 * de classes, então precisa do valor resolvido, igual ao GraficoChuva.
 *
 * Acessibilidade: a cor NUNCA é a única pista (WCAG 1.4.1 / e-MAG). Toda série
 * traz também o nome/prefixo da estação na legenda, na tabela e nos rótulos;
 * a cor é apoio visual.
 */

// 30 cores bem separadas no espectro, na mesma ordem do painel oficial.
export const CORES_COMPARACAO: readonly string[] = [
  '#2563eb', // 1. Azul forte
  '#dc2626', // 2. Vermelho
  '#16a34a', // 3. Verde
  '#f59e0b', // 4. Âmbar/Laranja
  '#8b5cf6', // 5. Roxo
  '#ec4899', // 6. Rosa/Magenta
  '#06b6d4', // 7. Ciano
  '#84cc16', // 8. Lima/Verde-limão
  '#f97316', // 9. Laranja forte
  '#6366f1', // 10. Índigo
  '#0891b2', // 11. Ciano escuro
  '#be123c', // 12. Rosa escuro
  '#4d7c0f', // 13. Verde oliva
  '#7c3aed', // 14. Violeta
  '#db2777', // 15. Magenta
  '#0d9488', // 16. Teal
  '#ca8a04', // 17. Amarelo escuro
  '#9333ea', // 18. Púrpura
  '#e11d48', // 19. Rosa vermelho
  '#059669', // 20. Esmeralda
  '#7c2d12', // 21. Marrom
  '#1d4ed8', // 22. Azul royal
  '#15803d', // 23. Verde escuro
  '#a21caf', // 24. Fúcsia
  '#c2410c', // 25. Laranja queimado
  '#0369a1', // 26. Azul céu escuro
  '#65a30d', // 27. Lima escuro
  '#b91c1c', // 28. Vermelho escuro
  '#4f46e5', // 29. Índigo escuro
  '#0f766e', // 30. Teal escuro
];

/**
 * Cor de comparação pelo índice da estação na cesta. Se houver mais estações
 * que cores, o ciclo se repete (o limite da cesta mantém isso bem abaixo de 30).
 */
export function corComparacao(indice: number): string {
  const i = ((indice % CORES_COMPARACAO.length) + CORES_COMPARACAO.length) %
    CORES_COMPARACAO.length;
  // Índice sempre válido (módulo do comprimento); o ?? satisfaz o
  // noUncheckedIndexedAccess sem alterar o comportamento.
  return CORES_COMPARACAO[i] ?? CORES_COMPARACAO[0]!;
}
