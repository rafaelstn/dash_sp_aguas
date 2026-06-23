import Link from 'next/link';
import { ItemSidenav } from './ItemSidenav';
import { MenuUsuario } from './MenuUsuario';
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

      <div className="border-t border-app-border-subtle px-2 py-2.5 text-xs text-app-fg-muted">
        {usuario ? (
          <MenuUsuario
            nome={usuario.nome}
            email={usuario.email}
            variante="sidenav"
          />
        ) : (
          <div className="flex flex-col gap-0.5 px-1">
            <Link
              href="/login"
              className="rounded-sm text-gov-azul hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
            >
              Entrar
            </Link>
            <Link
              href="/cadastrar"
              className="rounded-sm text-gov-azul hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
            >
              Cadastrar
            </Link>
          </div>
        )}
      </div>
    </aside>
  );
}
