import type { Metadata } from 'next';
import Link from 'next/link';
import '@/styles/globals.css';
import { SkipLink } from '@/components/a11y/SkipLink';
import { BadgeDesconformidades } from '@/components/features/desconformidades/BadgeDesconformidades';
import { modoDemoAtivo } from '@/infrastructure/repositories';

export const metadata: Metadata = {
  title: 'Ficha Técnica de Postos Hidrológicos — SPÁguas',
  description:
    'Consulta consolidada de postos hidrológicos da rede SPÁguas — Governo do Estado de São Paulo.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen">
        <SkipLink />
        {modoDemoAtivo ? (
          <div
            role="status"
            aria-live="polite"
            className="bg-amber-100 text-amber-900 border-b border-amber-300"
          >
            <div className="max-w-5xl mx-auto px-4 py-2 text-sm">
              <strong className="font-semibold">Modo demonstração.</strong>{' '}
              Os dados exibidos são fixtures em memória, sem conexão com o
              banco. Para utilizar o banco real, preencha{' '}
              <code className="font-mono">DATABASE_URL</code> no arquivo{' '}
              <code className="font-mono">.env.local</code> e reinicie o
              serviço.
            </div>
          </div>
        ) : null}
        <header className="bg-gov-azul text-white">
          <div className="max-w-5xl mx-auto px-4 py-4">
            <p className="text-sm text-white/80">Governo do Estado de São Paulo · SPÁguas</p>
            <h1 className="text-xl font-semibold">Ficha Técnica de Postos Hidrológicos</h1>
            <nav aria-label="Navegação principal" className="mt-3 flex gap-4 text-sm">
              <Link
                href="/"
                className="text-white/90 hover:text-white underline-offset-4 hover:underline"
              >
                Buscar postos
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
        <main id="conteudo-principal" className="max-w-5xl mx-auto px-4 py-8">
          {children}
        </main>
        <footer className="mt-12 border-t border-gov-borda bg-white">
          <div className="max-w-5xl mx-auto px-4 py-4 text-sm text-gov-muted">
            Sistema em rede interna. Acesso restrito ao setor SPÁguas.
          </div>
        </footer>
      </body>
    </html>
  );
}
