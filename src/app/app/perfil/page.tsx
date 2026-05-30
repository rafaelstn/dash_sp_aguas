import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import { HeaderMobile } from '@/components/mobile/HeaderMobile';

/**
 * Tela de perfil do técnico — informações + logout + (futuro) instalar PWA.
 *
 * O botão "Instalar app" canônico vive no `<InstallPWAPrompt>` (renderizado
 * no layout). Aqui mantemos só identidade + logout, mantendo a tela enxuta.
 */
export default async function PerfilPage() {
  const usuario = await obterUsuarioAtual();

  return (
    <>
      <HeaderMobile titulo="Perfil" />
      <div className="px-safe mx-auto w-full max-w-content space-y-4 py-5">
        <section
          aria-labelledby="perfil-titulo"
          className="rounded-gov-card border border-app-border-subtle bg-app-surface p-4"
        >
          <h2 id="perfil-titulo" className="sr-only">
            Identificação do técnico
          </h2>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-2xs uppercase tracking-wider text-app-fg-muted">
                Nome
              </dt>
              <dd className="text-app-fg">
                {usuario?.nome ?? 'Não informado'}
              </dd>
            </div>
            <div>
              <dt className="text-2xs uppercase tracking-wider text-app-fg-muted">
                E-mail institucional
              </dt>
              <dd className="break-all text-app-fg">
                {usuario?.email ?? 'Sessão não autenticada'}
              </dd>
            </div>
          </dl>
        </section>

        <a
          href="/auth/sair?returnTo=/app"
          className="block min-h-[48px] rounded-gov-card border border-app-border bg-app-surface p-3 text-center text-sm font-medium text-app-fg hover:bg-app-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul focus-visible:ring-offset-2"
        >
          Encerrar sessão
        </a>

        <p className="text-2xs text-app-fg-muted">
          Sistema institucional SP Águas. Acesso restrito ao corpo técnico
          autorizado.
        </p>
      </div>
    </>
  );
}
