'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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

  // Largura do conteúdo é decidida por rota. O Monitor (mapa) usa a largura
  // CHEIA disponível ao lado da navegação, aproveitando telas grandes onde o
  // mapa é o que mais pede espaço. As demais páginas (leitura, listas e
  // formulários como perfil e fichas) mantêm o teto confortável de leitura
  // (max-w-content), evitando linhas longas e campos esticados. Solução
  // contida no chrome: não altera nenhuma página individualmente.
  const pathname = usePathname();
  const rota = pathname ?? '';
  // O Monitor (mapa) e o Estoque (tabelas largas) usam a largura CHEIA ao lado
  // da navegacao; as demais paginas mantem o teto de leitura (max-w-content).
  const larguraCheia = rota.startsWith('/monitor') || rota.startsWith('/estoque');

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
            'flex h-header shrink-0 items-center overflow-hidden border-b border-app-border-subtle',
            'focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gov-azul',
            colapsado ? 'justify-center px-0' : 'gap-2 px-3',
          ].join(' ')}
        >
          {colapsado ? (
            // Recolhido: monograma limpo em vez do lockup espremido num
            // quadrado (que vira "SP A" cortado e ilegível). Caixa gov-azul
            // arredondada, nítida em 32px. O nome completo viaja no aria-label
            // do <Link>, então o "SP" aqui é decorativo.
            <span
              aria-hidden="true"
              className="inline-flex h-8 w-8 items-center justify-center rounded-gov-card bg-gov-azul text-xs font-bold tracking-tight text-white"
            >
              SP
            </span>
          ) : (
            // Expandido: o lockup "SP ÁGUAS" já carrega a marca; a assinatura
            // textual ao lado seria redundante e não cabe na faixa de 48px em
            // 224px. Logo contido na faixa (h-8 + object-contain) pra não vazar.
            <Image
              src="/logo-spaguas-header.png"
              alt="SP Águas - DMO, Governo do Estado de São Paulo"
              width={178}
              height={100}
              unoptimized
              priority
              className="h-8 w-auto object-contain"
            />
          )}
        </Link>

        <nav className="flex-1 overflow-y-auto p-2">
          {/* Rótulo de seção visível só no estado expandido. Recolhido, mantém
              só o heading oculto pra não introduzir ruído visual (o landmark
              nomeado é o <aside aria-label="Navegação principal">). */}
          {!colapsado ? (
            <p className="px-2 pb-2 pt-1 text-2xs font-semibold uppercase tracking-wider text-app-fg-muted">
              Navegação
            </p>
          ) : (
            <h2 className="sr-only">Navegação</h2>
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

        {/* Gatilho de colapso fixo no rodapé da sidebar. NÃO repete usuário.
            Sem borda: o respiro do padding já separa da lista, evita mais
            uma linha competindo com a divisória do topo e a borda lateral. */}
        <div className="p-2">
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
            {/* Mobile: hamburger do drawer (o gatilho de colapso do desktop
                vive dentro do próprio menu, no rodapé da sidebar). */}
            <MenuMobile itens={itens} />

            {/* Assinatura institucional: contexto sempre visível no topo. */}
            <div className="min-w-0 leading-tight">
              <p className="text-2xs uppercase tracking-wider text-app-fg-muted">
                Governo do Estado de SP
              </p>
              <p className="truncate text-xs font-semibold text-app-fg">
                SP Águas - DMO
              </p>
            </div>

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
          className={[
            'mx-auto w-full flex-1 px-4 py-6',
            larguraCheia ? '' : 'max-w-content',
          ].join(' ')}
        >
          <div className="space-y-6">{children}</div>
        </main>

        {/* Rodapé discreto sobre o fundo da página, sem borda nem superfície
            branca: o respiro separa do conteúdo e evita mais uma linha. */}
        <footer>
          <div
            className={[
              'mx-auto flex flex-wrap items-center justify-between gap-2 px-4 pb-4 pt-2 text-xs text-app-fg-subtle',
              larguraCheia ? '' : 'max-w-content',
            ].join(' ')}
          >
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
