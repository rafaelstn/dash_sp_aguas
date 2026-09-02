import Link from 'next/link';
import { LogOut } from 'lucide-react';
import { USUARIO_SEM_IDENTIDADE } from '@/domain/auth/usuario-sem-identidade';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Perfil — SP Águas - DMO',
};

/**
 * Tela de perfil do dashboard web. Espelha o conteúdo de `/app/perfil`
 * (identificação + encerrar sessão), porém dentro do chrome do dashboard
 * (sidenav + header), sem o HeaderMobile específico do PWA.
 *
 * Sem identificação, ela deixa de ser um perfil: a lista Nome / E-mail sai
 * inteira, em vez de ser preenchida com um texto de estado. Cartão de
 * identidade com rótulos "Nome" e "E-mail institucional" e nada por trás é
 * campo legível que ninguém escreve, e a tela passaria a afirmar que existe
 * uma identidade ali. O selo do header aponta para cá justamente porque esta
 * é a tela que responde "quem sou eu neste sistema".
 */
export default async function PaginaPerfil() {
  const usuario = await obterUsuarioAtual();
  const semIdentidade = usuario?.id === USUARIO_SEM_IDENTIDADE.id;

  if (semIdentidade) {
    return (
      <div className="mx-auto w-full max-w-xl space-y-6">
        <header>
          <h1 className="text-xl font-semibold text-app-fg">
            Acesso ao sistema
          </h1>
        </header>

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
            Esta instalação opera sem autenticação. As ações não são atribuídas
            a um usuário.
          </p>
          {/* Escopada em consulta a ficha de propósito: é o registro medido
              (a leitura da ficha grava IP e user-agent na trilha). Afirmar
              "todas as ações" seria prometer além do que existe. */}
          <p className="mt-2 text-sm text-app-fg-muted">
            As consultas a ficha continuam registradas com data, hora e endereço
            de rede do equipamento.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-app-fg">Perfil</h1>
        <p className="mt-0.5 text-xs text-app-fg-muted">
          Identificação da sessão e encerramento de acesso
        </p>
      </header>

      <section
        aria-labelledby="perfil-titulo"
        className="rounded-gov-card border border-app-border-subtle bg-app-surface p-4"
      >
        <h2 id="perfil-titulo" className="sr-only">
          Identificação do usuário
        </h2>
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-2xs uppercase tracking-wider text-app-fg-muted">
              Nome
            </dt>
            <dd className="text-app-fg">{usuario?.nome ?? 'Não informado'}</dd>
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

      <Link
        href="/auth/sair"
        className="inline-flex items-center gap-2 rounded-gov-card border border-app-border bg-app-surface px-4 py-2 text-sm font-medium text-gov-perigo hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-perigo"
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
        Encerrar sessão
      </Link>

      <p className="text-2xs text-app-fg-muted">
        Sistema institucional SP Águas. Acesso restrito ao corpo técnico
        autorizado.
      </p>
    </div>
  );
}
