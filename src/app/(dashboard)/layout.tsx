import Image from 'next/image';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import { Sidenav } from '@/components/layout/Sidenav';

/**
 * Chrome do app autenticado: sidenav esquerdo + header com identidade
 * institucional + footer. Aplicado a TODAS as rotas dentro do route group
 * `(dashboard)` — ficha técnica do posto, busca, painel, favoritos, etc.
 *
 * Rotas públicas (`/login`, `/cadastrar`) ficam fora deste group e
 * herdam apenas o root layout — visualizadas centralizadas, sem chrome.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const usuario = await obterUsuarioAtual();

  return (
    <div className="lg:flex">
      <Sidenav />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 h-header border-b border-app-border-subtle bg-app-surface">
          <div className="mx-auto flex h-full max-w-content items-center gap-3 px-4">
            <div className="flex items-center gap-2.5">
              <Image
                src="/logo-spaguas.png"
                alt=""
                width={32}
                height={32}
                priority
                className="h-8 w-auto"
              />
              <div className="leading-tight">
                <p className="text-2xs uppercase tracking-wider text-app-fg-muted">
                  Governo do Estado de SP
                </p>
                <p className="text-xs font-semibold text-app-fg">
                  SPÁguas · Ficha Técnica
                </p>
              </div>
            </div>

            <div className="ml-auto flex items-center gap-3">
              {usuario ? (
                <>
                  <span
                    className="hidden max-w-[220px] truncate text-xs text-app-fg-muted md:inline"
                    aria-label="Usuário autenticado"
                    title={usuario.email}
                  >
                    {usuario.nome ?? usuario.email}
                  </span>
                  <a
                    href="/auth/sair"
                    className="rounded px-2 py-1 text-xs font-medium text-gov-azul hover:bg-app-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul"
                  >
                    Sair
                  </a>
                </>
              ) : (
                <a
                  href="/login"
                  className="rounded px-2 py-1 text-xs font-medium text-gov-azul hover:bg-app-surface-2"
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
              Sistema em rede interna · Acesso restrito ao setor SPÁguas
            </span>
            <span aria-label="Status da indexação do acervo">
              {/* Fase 2: substituir por "Dados do acervo atualizados em DD/MM/AAAA HH:MM" */}
              Dados indexados sob demanda
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
