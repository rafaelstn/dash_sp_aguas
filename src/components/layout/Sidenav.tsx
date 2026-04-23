import Link from 'next/link';
import { favoritosRepository, desconformidadesRepository } from '@/infrastructure/repositories';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';

/**
 * Navegação lateral fixa (desktop ≥ lg). Em telas menores, o header já tem
 * navegação inline — este componente se oculta com `hidden lg:flex`.
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
    if (usuario) {
      totalFavoritos = await favoritosRepository.contar(usuario.id);
    }
  } catch {
    /* tolera erro no contador — sidenav ainda renderiza */
  }
  try {
    const c = await desconformidadesRepository.contar();
    totalDesconformidades = c.prefixoPrincipal + c.prefixoAna;
  } catch {
    /* idem */
  }

  const itens = [
    { href: '/', rotulo: 'Buscar postos', contador: null },
    { href: '/favoritos', rotulo: 'Favoritos', contador: totalFavoritos },
    { href: '/desconformidades', rotulo: 'Desconformidades', contador: totalDesconformidades },
  ] as const;

  return (
    <aside
      aria-label="Navegação principal"
      className="hidden lg:flex lg:flex-col lg:w-60 lg:shrink-0 lg:sticky lg:top-0 lg:self-start lg:h-screen border-r border-gov-borda bg-white"
    >
      <div className="px-4 py-4 border-b border-gov-borda">
        <p className="text-[10px] uppercase tracking-wider text-gov-muted">SPÁguas</p>
        <p className="text-sm font-semibold text-gov-texto leading-tight mt-0.5">
          Ficha Técnica
        </p>
      </div>
      <nav className="flex-1 p-2 space-y-1">
        {itens.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center justify-between gap-2 px-3 py-2 rounded-gov-card text-sm text-gov-texto hover:bg-gov-superficie focus-visible:bg-gov-superficie focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul transition-colors motion-safe:duration-150"
          >
            <span>{item.rotulo}</span>
            {item.contador !== null && item.contador > 0 ? (
              <span
                className="inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1.5 rounded-full bg-gov-azul-claro text-gov-azul text-xs font-semibold"
                aria-label={`${item.contador} itens`}
              >
                {item.contador.toLocaleString('pt-BR')}
              </span>
            ) : null}
          </Link>
        ))}
      </nav>
      <div className="px-4 py-3 border-t border-gov-borda text-xs text-gov-muted">
        {usuario ? (
          <>
            <p className="truncate" title={usuario.email}>
              {usuario.email}
            </p>
            <a href="/auth/sair" className="underline-offset-4 hover:underline text-gov-azul">
              Sair
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
