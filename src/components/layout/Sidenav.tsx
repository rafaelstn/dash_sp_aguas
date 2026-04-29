import Link from 'next/link';
import {
  favoritosRepository,
  desconformidadesRepository,
} from '@/infrastructure/repositories';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import { ItemSidenav, type IconeKey } from './ItemSidenav';

/**
 * Navegação lateral fixa (desktop ≥ lg). Em telas menores, oculta-se com
 * `hidden lg:flex` — mobile usa links inline no header (futuro: drawer).
 *
 * Contadores:
 *  - favoritos: do usuário autenticado (0 se deslogado).
 *  - desconformidades: total de postos desconformes (view v_postos_desconformes).
 */
export async function Sidenav() {
  const usuario = await obterUsuarioAtual();
  let totalFavoritos = 0;
  let totalDesconformidades = 0;

  try {
    if (usuario) totalFavoritos = await favoritosRepository.contar(usuario.id);
  } catch {
    /* tolera erro — sidenav ainda renderiza */
  }
  try {
    const c = await desconformidadesRepository.contar();
    totalDesconformidades = c.prefixoPrincipal + c.prefixoAna;
  } catch {
    /* idem */
  }

  const itens: ReadonlyArray<{
    href: string;
    rotulo: string;
    icone: IconeKey;
    contador: number | null;
    atalho?: string;
  }> = [
    { href: '/painel', rotulo: 'Painel', icone: 'dashboard', contador: null, atalho: 'P' },
    { href: '/', rotulo: 'Buscar postos', icone: 'search', contador: null, atalho: '/' },
    { href: '/favoritos', rotulo: 'Favoritos', icone: 'star', contador: totalFavoritos, atalho: 'F' },
    {
      href: '/desconformidades',
      rotulo: 'Desconformidades',
      icone: 'alert',
      contador: totalDesconformidades,
      atalho: 'D',
    },
  ];

  return (
    <aside
      aria-label="Navegação principal"
      className="hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-sidenav lg:shrink-0 lg:flex-col border-r border-app-border-subtle bg-app-surface"
    >
      <nav className="flex-1 p-2">
        <p className="px-2 pb-2 pt-1 text-2xs font-semibold uppercase tracking-wider text-app-fg-subtle">
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
          <Link href="/login" className="text-gov-azul hover:underline">
            Entrar
          </Link>
        )}
      </div>
    </aside>
  );
}
