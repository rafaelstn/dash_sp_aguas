import Link from 'next/link';
import { ItemSidenav } from './ItemSidenav';
import type { ItemNav } from './nav-itens';
import type { UsuarioAutenticado } from '@/infrastructure/auth/current-user';

interface Props {
  itens: ItemNav[];
  usuario: UsuarioAutenticado | null;
}

/**
 * Navegação lateral fixa para desktop ≥ lg. Em telas menores fica oculta
 * via `hidden lg:flex`, o MenuMobile (drawer com hamburger) cobre o
 * mesmo conteúdo via header em mobile/tablet.
 *
 * Itens e usuário vêm como props já calculados pela `obterItensNav` no
 * layout (evita duplicar queries entre desktop e mobile).
 */
export function Sidenav({ itens, usuario }: Props) {
  return (
    <aside
      aria-label="Navegação principal"
      className="hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-sidenav lg:shrink-0 lg:flex-col border-r border-app-border-subtle bg-app-surface"
    >
      <nav className="flex-1 p-2">
        <p className="px-2 pb-2 pt-1 text-2xs font-semibold uppercase tracking-wider text-app-fg-muted">
          Navegação
        </p>
        <ul className="space-y-0.5">
          {itens.map((item) => (
            <li key={item.href}>
              <ItemSidenav
                href={item.href}
                rotulo={item.rotulo}
                icone={item.icone}
                contador={item.contador}
                atalho={item.atalho}
              />
            </li>
          ))}
        </ul>
      </nav>

      <div className="border-t border-app-border-subtle px-3 py-2.5 text-xs text-app-fg-muted">
        {usuario ? (
          <>
            {usuario.nome ? (
              <p
                className="truncate font-medium text-app-fg"
                title={usuario.nome}
              >
                {usuario.nome}
              </p>
            ) : null}
            <p className="truncate" title={usuario.email}>
              {usuario.email}
            </p>
            <a
              href="/auth/sair"
              className="mono rounded-sm text-2xs text-gov-azul hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul"
            >
              sair
            </a>
          </>
        ) : (
          <div className="flex flex-col gap-0.5">
            <Link href="/login" className="text-gov-azul hover:underline">
              Entrar
            </Link>
            <Link href="/cadastrar" className="text-gov-azul hover:underline">
              Cadastrar
            </Link>
          </div>
        )}
      </div>
    </aside>
  );
}
