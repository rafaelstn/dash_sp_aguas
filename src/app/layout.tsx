import type { Metadata } from 'next';
import Link from 'next/link';
import '@/styles/globals.css';
import { SkipLink } from '@/components/a11y/SkipLink';
import { BadgeDesconformidades } from '@/components/features/desconformidades/BadgeDesconformidades';
import { modoDemoAtivo } from '@/infrastructure/repositories';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import { Sidenav } from '@/components/layout/Sidenav';

export const metadata: Metadata = {
  title: 'Ficha Técnica de Postos Hidrológicos — SPÁguas',
  description:
    'Consulta consolidada de postos hidrológicos da rede SPÁguas — Governo do Estado de São Paulo.',
  robots: { index: false, follow: false },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const usuario = await obterUsuarioAtual();
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-gov-superficie">
        <SkipLink />
        {modoDemoAtivo ? (
          <div
            role="status"
            aria-live="polite"
            className="bg-amber-100 text-amber-900 border-b border-amber-300"
          >
            <div className="max-w-7xl mx-auto px-4 py-2 text-sm">
              <strong className="font-semibold">Modo demonstração.</strong>{' '}
              Os dados exibidos são fixtures em memória, sem conexão com o
              banco. Para utilizar o banco real, preencha{' '}
              <code className="font-mono">DATABASE_URL</code> no arquivo{' '}
              <code className="font-mono">.env.local</code> e reinicie o
              serviço.
            </div>
          </div>
        ) : null}
        <div className="lg:flex">
          <Sidenav />
          <div className="flex-1 flex flex-col min-w-0">
            <header className="bg-gov-azul text-white">
              <div className="max-w-7xl mx-auto px-4 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm text-white/80">
                      Governo do Estado de São Paulo · SPÁguas
                    </p>
                    <h1 className="text-xl font-semibold">
                      Ficha Técnica de Postos Hidrológicos
                    </h1>
                  </div>
                  {usuario ? (
                    <div className="text-xs text-white/90 text-right shrink-0">
                      <p aria-label="Usuário autenticado">{usuario.email}</p>
                      <a
                        href="/auth/sair"
                        className="underline-offset-4 hover:underline text-white"
                      >
                        Sair
                      </a>
                    </div>
                  ) : null}
                </div>
                <nav
                  aria-label="Navegação principal"
                  className="mt-3 flex flex-wrap gap-4 text-sm lg:hidden"
                >
                  <Link
                    href="/"
                    className="text-white/90 hover:text-white underline-offset-4 hover:underline"
                  >
                    Buscar postos
                  </Link>
                  <Link
                    href="/favoritos"
                    className="text-white/90 hover:text-white underline-offset-4 hover:underline"
                  >
                    Favoritos
                  </Link>
                  <Link
                    href="/desconformidades"
                    className="text-white/90 hover:text-white underline-offset-4 hover:underline inline-flex items-center gap-2"
                  >
                    <span>Desconformidades cadastrais</span>
                    <BadgeDesconformidades />
                  </Link>
                </nav>
              </div>
            </header>
            <main
              id="conteudo-principal"
              className="max-w-7xl mx-auto w-full px-4 py-8 flex-1"
            >
              {children}
            </main>
            <footer className="mt-12 border-t border-gov-borda bg-white">
              <div className="max-w-7xl mx-auto px-4 py-4 text-sm text-gov-muted">
                Sistema em rede interna. Acesso restrito ao setor SPÁguas.
              </div>
            </footer>
          </div>
        </div>
      </body>
    </html>
  );
}
