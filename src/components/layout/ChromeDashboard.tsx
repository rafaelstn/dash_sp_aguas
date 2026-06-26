'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { ItemSidenav } from './ItemSidenav';
import { MenuMobile } from './MenuMobile';
import { MenuUsuario } from './MenuUsuario';
import type { ItemNav } from './nav-itens';
import type { UsuarioAutenticado } from '@/infrastructure/auth/current-user';

interface Props {
  itens: ItemNav[];
  usuario: UsuarioAutenticado | null;
  children: React.ReactNode;
}

const CHAVE_COLAPSO = 'spaguas:sidenav-colapsado';

/**
 * Casca (chrome) do app autenticado no desktop. Cliente porque governa o
 * estado de colapso da navegação lateral, compartilhado entre a sidebar
 * (largura e modo só-ícone), o gatilho no header e a área de conteúdo
 * (que precisa reagir à largura). Os filhos chegam já renderizados no
 * servidor (RSC), preservando Server Component por padrão nas páginas.
 *
 * Identidade institucional (logo + assinatura) vive no TOPO da sidebar,
 * alinhada à altura do header, formando uma linha divisória contínua. O
 * header passa a ser barra de ferramentas: gatilho de colapso à esquerda
 * e menu do usuário à direita (único lugar onde nome/e-mail aparecem).
 */
export function ChromeDashboard({ itens, usuario, children }: Props) {
  // Inicia expandido no SSR e no 1º paint pra não piscar; lê a preferência
  // salva logo após montar. Evita divergência de hidratação.
  const [colapsado, setColapsado] = useState(false);
  const [hidratado, setHidratado] = useState(false);

  useEffect(() => {
    try {
      setColapsado(localStorage.getItem(CHAVE_COLAPSO) === '1');
    } catch {
      /* localStorage indisponível: mantém expandido */
    }
    setHidratado(true);
  }, []);

  const alternar = useCallback(() => {
    setColapsado((v) => {
      const proximo = !v;
      try {
        localStorage.setItem(CHAVE_COLAPSO, proximo ? '1' : '0');
      } catch {
        /* tolera */
      }
      return proximo;
    });
  }, []);

  return (
    <div className="lg:flex">
      <aside
        id="navegacao-lateral"
        aria-label="Navegação principal"
        className={[
          'hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:shrink-0 lg:flex-col',
          'border-r border-app-border-subtle bg-app-surface',
          // Sem transição até hidratar pra não animar o ajuste inicial.
          hidratado ? 'transition-[width] duration-200 ease-gov-ease' : '',
          colapsado ? 'lg:w-16' : 'lg:w-sidenav',
        ].join(' ')}
      >
        {/* Identidade institucional: topo da sidebar, mesma altura do header. */}
        <Link
          href="/painel"
          aria-label="SP Águas - DMO, ir para o painel"
          className={[
            'flex h-header shrink-0 items-center border-b border-app-border-subtle',
            'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gov-azul',
            colapsado ? 'justify-center px-0' : 'gap-2.5 px-3',
          ].join(' ')}
        >
          <Image
            src={colapsado ? '/icons/icon-192.png' : '/logo-spaguas-header.png'}
            alt=""
            width={colapsado ? 64 : 178}
            height={colapsado ? 64 : 100}
            unoptimized
            priority
            className={colapsado ? 'h-7 w-7' : 'h-9 w-auto'}
          />
          {!colapsado ? (
            <span className="min-w-0 leading-tight">
              <span className="block text-2xs uppercase tracking-wider text-app-fg-muted">
                Governo do Estado de SP
              </span>
              <span className="block truncate text-xs font-semibold text-app-fg">
                SP Águas - DMO
              </span>
            </span>
          ) : null}
        </Link>

        <nav className="flex-1 overflow-y-auto p-2">
          {!colapsado ? (
            <p className="px-2 pb-2 pt-1 text-2xs font-semibold uppercase tracking-wider text-app-fg-muted">
              Navegação
            </p>
          ) : (
            <p className="pb-2 pt-1 text-center text-2xs font-semibold uppercase tracking-wider text-app-fg-subtle">
              <span aria-hidden="true">•••</span>
              <span className="sr-only">Navegação</span>
            </p>
          )}
          <ul className="space-y-0.5">
            {itens.map((item) => (
              <li key={item.href}>
                <ItemSidenav
                  href={item.href}
                  rotulo={item.rotulo}
                  icone={item.icone}
                  contador={item.contador}
                  atalho={item.atalho}
                  colapsado={colapsado}
                />
              </li>
            ))}
          </ul>
        </nav>

        {/* Gatilho de colapso fixo no rodapé da sidebar. NÃO repete usuário. */}
        <div className="border-t border-app-border-subtle p-2">
          <button
            type="button"
            onClick={alternar}
            aria-expanded={!colapsado}
            aria-controls="navegacao-lateral"
            className={[
              'group flex h-8 w-full items-center rounded px-2 text-sm text-app-fg-muted',
              'transition-colors motion-safe:duration-100 hover:bg-app-surface-2 hover:text-app-fg',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul',
              colapsado ? 'justify-center' : 'gap-2',
            ].join(' ')}
            title={colapsado ? 'Expandir menu' : 'Recolher menu'}
          >
            {colapsado ? (
              <PanelLeftOpen className="h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <PanelLeftClose className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            {!colapsado ? <span>Recolher menu</span> : null}
            <span className="sr-only">
              {colapsado ? 'Expandir menu de navegação' : 'Recolher menu de navegação'}
            </span>
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 h-header border-b border-app-border-subtle bg-app-surface">
          <div className="flex h-full items-center gap-3 px-4">
            {/* Mobile: hamburger do drawer. Desktop: gatilho de colapso. */}
            <MenuMobile itens={itens} />
            <button
              type="button"
              onClick={alternar}
              aria-expanded={!colapsado}
              aria-controls="navegacao-lateral"
              className="hidden rounded p-1.5 text-app-fg-muted hover:bg-app-surface-2 hover:text-app-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul lg:inline-flex"
              title={colapsado ? 'Expandir menu' : 'Recolher menu'}
            >
              {colapsado ? (
                <PanelLeftOpen className="h-5 w-5" aria-hidden="true" />
              ) : (
                <PanelLeftClose className="h-5 w-5" aria-hidden="true" />
              )}
              <span className="sr-only">
                {colapsado ? 'Expandir menu de navegação' : 'Recolher menu de navegação'}
              </span>
            </button>

            <div className="ml-auto flex items-center gap-3">
              {usuario ? (
                <MenuUsuario nome={usuario.nome} email={usuario.email} />
              ) : (
                <a
                  href="/login"
                  className="rounded px-2 py-1 text-xs font-medium text-gov-azul hover:bg-app-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
                >
                  Entrar
                </a>
              )}
            </div>
          </div>
        </header>

        <main
          id="conteudo-principal"
          className="mx-auto w-full max-w-content flex-1 px-4 py-6"
        >
          <div className="space-y-6">{children}</div>
        </main>

        <footer className="border-t border-app-border-subtle bg-app-surface">
          <div className="mx-auto flex max-w-content flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs text-app-fg-muted">
            <span>
              Sistema em rede interna · Acesso restrito ao setor SP Águas
            </span>
            <span aria-label="Status da indexação do acervo">
              Dados indexados sob demanda
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
