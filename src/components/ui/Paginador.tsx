import Link from 'next/link';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

export interface PaginadorProps {
  /** Página atual (1-indexed). */
  pagina: number;
  /** Itens por página — usado pra calcular total de páginas. */
  porPagina: number;
  /** Total absoluto de itens (não da página atual). */
  total: number;
  /**
   * Constrói a URL de uma página específica preservando os demais params
   * da busca atual. Recebe número da página, retorna pathname + query.
   */
  hrefPagina: (pagina: number) => string;
  /** Rótulo acessível do componente. Default: "Paginação". */
  rotuloAria?: string;
}

/**
 * Paginação por links — server-side, sem JS. Mostra:
 *   « ‹ 1 2 [3] 4 … 47 › »
 *
 * Esconde-se quando o conteúdo cabe em uma página. Janela de até 7 botões
 * numéricos visíveis (atual ± 2, mais primeira/última). Reticências no
 * meio quando há gap.
 *
 * Acessibilidade:
 *   - <nav aria-label> identifica a região
 *   - aria-current="page" no link da página atual
 *   - aria-label informa o destino ("Ir para página 4 de 47")
 *   - Setas Lucide com aria-hidden — texto invisível (sr-only) pro leitor
 */
export function Paginador({
  pagina,
  porPagina,
  total,
  hrefPagina,
  rotuloAria = 'Paginação',
}: PaginadorProps) {
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  if (totalPaginas <= 1) return null;

  const paginaAtual = Math.min(Math.max(1, pagina), totalPaginas);
  const ehPrimeira = paginaAtual === 1;
  const ehUltima = paginaAtual === totalPaginas;

  const numeros = construirJanela(paginaAtual, totalPaginas);

  // Faixa de itens da página atual — mostrada à direita pra contexto numérico.
  const inicioFaixa = (paginaAtual - 1) * porPagina + 1;
  const fimFaixa = Math.min(paginaAtual * porPagina, total);

  return (
    <nav
      aria-label={rotuloAria}
      className="flex flex-wrap items-center justify-between gap-3 border-t border-app-border-subtle pt-3"
    >
      <p className="text-xs text-app-fg-muted tabular">
        Mostrando{' '}
        <span className="font-medium text-app-fg">
          {inicioFaixa.toLocaleString('pt-BR')}
        </span>
        {'–'}
        <span className="font-medium text-app-fg">
          {fimFaixa.toLocaleString('pt-BR')}
        </span>{' '}
        de{' '}
        <span className="font-medium text-app-fg">
          {total.toLocaleString('pt-BR')}
        </span>{' '}
        — página {paginaAtual} de {totalPaginas}
      </p>

      <ul className="flex items-center gap-1">
        <li>
          <BotaoNavegacao
            href={ehPrimeira ? null : hrefPagina(1)}
            ariaLabel="Ir para a primeira página"
          >
            <ChevronsLeft className="h-4 w-4" aria-hidden="true" />
          </BotaoNavegacao>
        </li>
        <li>
          <BotaoNavegacao
            href={ehPrimeira ? null : hrefPagina(paginaAtual - 1)}
            ariaLabel={`Página anterior (${paginaAtual - 1})`}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </BotaoNavegacao>
        </li>

        {numeros.map((n, i) =>
          n === '…' ? (
            <li
              key={`gap-${i}`}
              aria-hidden="true"
              className="px-2 text-xs text-app-fg-subtle"
            >
              …
            </li>
          ) : (
            <li key={n}>
              <Link
                href={hrefPagina(n)}
                aria-current={n === paginaAtual ? 'page' : undefined}
                aria-label={`Ir para página ${n} de ${totalPaginas}`}
                className={[
                  'mono inline-flex h-8 min-w-[2rem] items-center justify-center rounded border px-2 text-xs font-medium tabular',
                  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul',
                  n === paginaAtual
                    ? 'border-gov-azul bg-gov-azul-claro text-gov-azul'
                    : 'border-app-border-subtle bg-app-surface text-app-fg hover:bg-app-surface-2',
                ].join(' ')}
              >
                {n}
              </Link>
            </li>
          ),
        )}

        <li>
          <BotaoNavegacao
            href={ehUltima ? null : hrefPagina(paginaAtual + 1)}
            ariaLabel={`Próxima página (${paginaAtual + 1})`}
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </BotaoNavegacao>
        </li>
        <li>
          <BotaoNavegacao
            href={ehUltima ? null : hrefPagina(totalPaginas)}
            ariaLabel={`Ir para a última página (${totalPaginas})`}
          >
            <ChevronsRight className="h-4 w-4" aria-hidden="true" />
          </BotaoNavegacao>
        </li>
      </ul>
    </nav>
  );
}

function BotaoNavegacao({
  href,
  ariaLabel,
  children,
}: {
  href: string | null;
  ariaLabel: string;
  children: React.ReactNode;
}) {
  const baseClasse =
    'inline-flex h-8 w-8 items-center justify-center rounded border border-app-border-subtle text-app-fg-muted ' +
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul';

  if (!href) {
    return (
      <span
        aria-disabled="true"
        aria-label={ariaLabel}
        className={`${baseClasse} cursor-not-allowed bg-app-surface-2 opacity-40`}
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className={`${baseClasse} bg-app-surface hover:bg-app-surface-2 hover:text-app-fg`}
    >
      {children}
    </Link>
  );
}

/**
 * Janela de páginas a renderizar.
 * Estratégia: sempre mostra 1, sempre mostra última, e até ~5 ao redor da
 * atual. Reticências (`'…'`) preenchem gaps. Pra ≤ 7 páginas, lista todas.
 *
 * Exemplos:
 *   atual=1, total=3   → [1, 2, 3]
 *   atual=4, total=10  → [1, '…', 3, 4, 5, '…', 10]
 *   atual=10, total=10 → [1, '…', 8, 9, 10]
 */
function construirJanela(
  atual: number,
  total: number,
): Array<number | '…'> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const conjunto = new Set<number>([1, total, atual, atual - 1, atual + 1]);
  // Inclui mais 1 vizinho pra dar peso à navegação local
  if (atual <= 4) {
    conjunto.add(2).add(3).add(4).add(5);
  }
  if (atual >= total - 3) {
    conjunto.add(total - 1).add(total - 2).add(total - 3).add(total - 4);
  }

  const ordenadas = [...conjunto].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);

  const resultado: Array<number | '…'> = [];
  for (let i = 0; i < ordenadas.length; i += 1) {
    const n = ordenadas[i]!;
    const anterior = i > 0 ? ordenadas[i - 1]! : null;
    if (anterior !== null && n - anterior > 1) {
      resultado.push('…');
    }
    resultado.push(n);
  }
  return resultado;
}
