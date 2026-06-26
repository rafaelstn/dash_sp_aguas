'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Search,
  Star,
  AlertTriangle,
  LayoutDashboard,
  Inbox,
  Workflow,
  CloudRain,
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
  inbox: Inbox,
  workflow: Workflow,
  rain: CloudRain,
} as const satisfies Record<string, LucideIcon>;

export type IconeKey = keyof typeof ICONES;

export interface ItemSidenavProps {
  href: string;
  rotulo: string;
  icone: IconeKey;
  contador: number | null;
  atalho?: string;
  /** Modo só-ícone da sidebar recolhida (desktop): rótulo via aria-label/tooltip. */
  colapsado?: boolean;
}

export function ItemSidenav({
  href,
  rotulo,
  icone,
  contador,
  atalho,
  colapsado = false,
}: ItemSidenavProps) {
  const pathname = usePathname();
  const Icone = ICONES[icone];
  const ativo =
    href === '/'
      ? pathname === '/'
      : pathname === href || pathname.startsWith(href + '/');

  const temContador = contador !== null && contador > 0;
  const contadorFmt = temContador ? contador.toLocaleString('pt-BR') : '';

  if (colapsado) {
    // Recolhido: só o ícone, centralizado. O rótulo (e o contador, quando
    // houver) viajam no aria-label e no title — o leitor de tela e o tooltip
    // continuam comunicando tudo. O atalho de teclado segue válido (handler
    // global), apenas não é exibido por falta de espaço.
    const descricao = temContador ? `${rotulo}, ${contadorFmt} itens` : rotulo;
    return (
      <Link
        href={href}
        aria-current={ativo ? 'page' : undefined}
        aria-label={descricao}
        title={descricao}
        className={[
          'group relative flex h-9 items-center justify-center rounded transition-colors motion-safe:duration-100',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul',
          ativo
            ? 'bg-gov-azul-claro text-gov-azul'
            : 'text-app-fg-muted hover:bg-app-surface-2 hover:text-app-fg',
        ].join(' ')}
      >
        {ativo ? (
          <span
            aria-hidden="true"
            className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r bg-gov-azul"
          />
        ) : null}
        <Icone
          className={['h-4 w-4 shrink-0', ativo ? 'text-gov-azul' : ''].join(' ')}
          aria-hidden="true"
          strokeWidth={ativo ? 2.25 : 2}
        />
        {temContador ? (
          <span
            aria-hidden="true"
            className="absolute right-1 top-1 h-2 w-2 rounded-full bg-gov-azul ring-2 ring-app-surface"
          />
        ) : null}
      </Link>
    );
  }

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

      {temContador ? (
        <span
          className="mono tabular min-w-[1.5rem] rounded bg-app-surface-2 px-1 text-center text-2xs font-semibold text-app-fg-muted"
          aria-label={`${contador} itens`}
        >
          {contadorFmt}
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
