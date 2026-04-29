'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Search,
  Star,
  AlertTriangle,
  LayoutDashboard,
  type LucideIcon,
} from 'lucide-react';

/**
 * Mapeamento chave → componente lucide.
 *
 * Motivo: Server Components (Sidenav) não conseguem serializar componentes
 * React (funções) como prop para Client Components. O Sidenav envia uma
 * string e o cliente resolve o ícone real.
 */
const ICONES = {
  dashboard: LayoutDashboard,
  search: Search,
  star: Star,
  alert: AlertTriangle,
} as const satisfies Record<string, LucideIcon>;

export type IconeKey = keyof typeof ICONES;

export interface ItemSidenavProps {
  href: string;
  rotulo: string;
  icone: IconeKey;
  contador: number | null;
  atalho?: string;
}

export function ItemSidenav({
  href,
  rotulo,
  icone,
  contador,
  atalho,
}: ItemSidenavProps) {
  const pathname = usePathname();
  const Icone = ICONES[icone];
  const ativo =
    href === '/'
      ? pathname === '/'
      : pathname === href || pathname.startsWith(href + '/');

  return (
    <Link
      href={href}
      aria-current={ativo ? 'page' : undefined}
      className={[
        'group relative flex h-8 items-center gap-2 rounded px-2 text-sm transition-colors motion-safe:duration-100',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul',
        ativo
          ? 'bg-gov-azul-claro font-medium text-gov-azul'
          : 'text-app-fg hover:bg-app-surface-2',
      ].join(' ')}
    >
      {ativo ? (
        <span
          aria-hidden="true"
          className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-gov-azul"
        />
      ) : null}

      <Icone
        className={[
          'h-4 w-4 shrink-0',
          ativo
            ? 'text-gov-azul'
            : 'text-app-fg-muted group-hover:text-app-fg',
        ].join(' ')}
        aria-hidden="true"
        strokeWidth={ativo ? 2.25 : 2}
      />
      <span className="flex-1 truncate">{rotulo}</span>

      {contador !== null && contador > 0 ? (
        <span
          className="mono tabular min-w-[1.5rem] rounded bg-app-surface-2 px-1 text-center text-2xs font-semibold text-app-fg-muted"
          aria-label={`${contador} itens`}
        >
          {contador.toLocaleString('pt-BR')}
        </span>
      ) : null}

      {atalho ? (
        <kbd
          aria-hidden="true"
          className="mono hidden rounded border border-app-border-subtle bg-app-surface px-1 text-2xs text-app-fg-subtle group-hover:inline"
        >
          {atalho}
        </kbd>
      ) : null}
    </Link>
  );
}
