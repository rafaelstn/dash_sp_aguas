/**
 * Atalho de acessibilidade (WCAG 2.4.1) — permite pular blocos de navegação
 * e ir direto ao conteúdo principal. Fica visualmente oculto até receber foco.
 */
export function SkipLink() {
  return (
    <a
      href="#conteudo-principal"
      className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-gov-azul focus:text-white focus:px-4 focus:py-2 focus:rounded"
    >
      Ir para o conteúdo principal
    </a>
  );
}
