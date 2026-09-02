import { USUARIO_SEM_IDENTIDADE } from '@/domain/auth/usuario-sem-identidade';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import { HeaderMobile } from '@/components/mobile/HeaderMobile';

/**
 * Tela de perfil do técnico — informações + logout + (futuro) instalar PWA.
 *
 * O botão "Instalar app" canônico vive no `<InstallPWAPrompt>` (renderizado
 * no layout). Aqui mantemos só identidade + logout, mantendo a tela enxuta.
 *
 * Sem identificação, a lista Nome / E-mail sai inteira e "Encerrar sessão"
 * some (não há sessão para encerrar, e link que não desconecta é defeito
 * silencioso). É a tela do app que responde "quem sou eu neste sistema", pelo
 * mesmo motivo de `/perfil` no painel web.
 */
export default async function PerfilPage() {
  const usuario = await obterUsuarioAtual();
  const semIdentidade = usuario?.id === USUARIO_SEM_IDENTIDADE.id;

  if (semIdentidade) {
    return (
      <>
        <HeaderMobile titulo="Acesso ao sistema" />
        <div className="px-safe mx-auto w-full max-w-content space-y-4 py-5">
          <section
            aria-labelledby="acesso-titulo"
            className="rounded-gov-card border border-app-border-subtle bg-app-surface p-4"
          >
            <h2
              id="acesso-titulo"
              className="text-sm font-semibold text-app-fg"
            >
              Acesso sem identificação
            </h2>
            <p className="mt-2 text-sm text-app-fg-muted">
              Esta instalação opera sem autenticação. As ações não são
              atribuídas a um usuário.
            </p>
            {/* Escopada em consulta a ficha de propósito: é o registro medido.
                Afirmar "todas as ações" seria prometer além do que existe. */}
            <p className="mt-2 text-sm text-app-fg-muted">
              As consultas a ficha continuam registradas com data, hora e
              endereço de rede do equipamento.
            </p>
          </section>

          <section
            aria-labelledby="autoria-titulo"
            className="rounded-gov-card border border-app-border-subtle bg-app-surface p-4"
          >
            <h2
              id="autoria-titulo"
              className="text-sm font-semibold text-app-fg"
            >
              Autoria da ficha
            </h2>
            <p className="mt-2 text-sm text-app-fg-muted">
              O nome informado no preenchimento é a única identificação
              registrada na ficha.
            </p>
          </section>
        </div>
      </>
    );
  }

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
