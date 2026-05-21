'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface AbaBottomNav {
  href: string;
  rotulo: string;
  /** Função que decide se a aba está ativa pra esta rota. */
  ativa: (pathname: string) => boolean;
  icone: React.ReactNode;
}

// Ícones SVG inline — sem dependência adicional. lucide-react está no
// package.json mas evitamos import dinâmico em componente cliente que é
// renderizado em todas as páginas (custo de bundle).
const IconeHome = (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-5 w-5"
  >
    <path d="M3 12 12 4l9 8" />
    <path d="M5 10v10h14V10" />
  </svg>
);

const IconeLista = (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-5 w-5"
  >
    <path d="M8 6h13" />
    <path d="M8 12h13" />
    <path d="M8 18h13" />
    <circle cx="3.5" cy="6" r="1" />
    <circle cx="3.5" cy="12" r="1" />
    <circle cx="3.5" cy="18" r="1" />
  </svg>
);

const IconePerfil = (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-5 w-5"
  >
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4.418 3.582-8 8-8s8 3.582 8 8" />
  </svg>
);

const ABAS: AbaBottomNav[] = [
  {
    href: '/app',
    rotulo: 'Início',
    ativa: (p) => p === '/app',
    icone: IconeHome,
  },
  {
    href: '/app/minhas-fichas',
    rotulo: 'Minhas fichas',
    ativa: (p) => p.startsWith('/app/minhas-fichas'),
    icone: IconeLista,
  },
  {
    href: '/app/perfil',
    rotulo: 'Perfil',
    ativa: (p) => p.startsWith('/app/perfil'),
    icone: IconePerfil,
  },
];

/**
 * Bottom nav fixo de 3 abas, navegável por teclado, marca `aria-current`
 * na rota ativa. Touch targets ≥ 44px (regra `governo.md` + Apple HIG).
 *
 * Client Component — depende de `usePathname` para destacar a aba ativa.
 */
export function BottomNav() {
  const pathname = usePathname() ?? '/app';

  return (
    <nav
      aria-label="Navegação principal do aplicativo"
      className="sticky bottom-0 z-30 border-t border-app-border-subtle bg-app-surface shadow-gov-sticky"
      // safe-area: barra de gestos embaixo e notch nas laterais (landscape)
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0)',
        paddingLeft: 'env(safe-area-inset-left, 0)',
        paddingRight: 'env(safe-area-inset-right, 0)',
      }}
    >
      <ul className="mx-auto flex max-w-content items-stretch justify-around">
        {ABAS.map((aba) => {
          const ativa = aba.ativa(pathname);
          return (
            <li key={aba.href} className="flex-1">
              <Link
                href={aba.href}
                aria-current={ativa ? 'page' : undefined}
                className={`group relative flex min-h-[56px] flex-col items-center justify-center gap-1 px-2 py-1.5 text-2xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gov-azul ${
                  ativa
                    ? 'text-gov-azul'
                    : 'text-app-fg-muted hover:text-app-fg active:text-app-fg'
                }`}
              >
                {/* Indicador da aba ativa: barra no topo, não depende só de cor */}
                <span
                  aria-hidden="true"
                  className={`absolute inset-x-4 top-0 h-0.5 rounded-full transition-opacity duration-150 ${
                    ativa ? 'bg-gov-azul opacity-100' : 'opacity-0'
                  }`}
                />
                <span
                  className={`pointer-events-none flex h-7 w-12 items-center justify-center rounded-full transition-colors ${
                    ativa ? 'bg-gov-azul-claro' : 'bg-transparent'
                  }`}
                >
                  {aba.icone}
                </span>
                <span>{aba.rotulo}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
