import type { Metadata } from 'next';
import '@/styles/globals.css';
import { SkipLink } from '@/components/a11y/SkipLink';
import { modoDemoAtivo } from '@/infrastructure/repositories';
import { AtalhosTeclado } from '@/components/layout/AtalhosTeclado';

export const metadata: Metadata = {
  title: 'Ficha Técnica de Postos Hidrológicos — SPÁguas',
  description:
    'Consulta consolidada de postos hidrológicos da rede SPÁguas — Governo do Estado de São Paulo.',
  robots: { index: false, follow: false },
};

/**
 * Root layout mínimo. Apenas o necessário pra QUALQUER rota — incluindo
 * páginas públicas (`/login`, `/cadastrar`) onde o chrome do app não deve
 * aparecer.
 *
 * O chrome completo (sidenav + header + footer) vive em
 * `src/app/(dashboard)/layout.tsx` e só carrega pras rotas autenticadas.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-app-bg text-app-fg">
        <SkipLink />
        <AtalhosTeclado />

        {modoDemoAtivo ? (
          <div
            role="status"
            aria-live="polite"
            className="border-b border-amber-300 bg-amber-50 text-amber-900"
          >
            <div className="mx-auto max-w-content px-4 py-1.5 text-xs leading-5">
              <strong className="font-semibold">Modo demonstração.</strong>{' '}
              Dados em memória — preencha{' '}
              <code className="font-mono">DATABASE_URL</code> em{' '}
              <code className="font-mono">.env.local</code> e reinicie o serviço.
            </div>
          </div>
        ) : null}

        {children}
      </body>
    </html>
  );
}
