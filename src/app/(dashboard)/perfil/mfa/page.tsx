import Link from 'next/link';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import { papeisRepository } from '@/infrastructure/repositories';
import { Alerta } from '@/components/ui/Alerta';
import { WizardMFA } from '@/components/features/triagem/WizardMFA';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Configurar segundo fator (MFA) — SPÁguas',
};

export default async function ConfigurarMFAPage() {
  const usuario = await obterUsuarioAtual();
  if (!usuario) {
    return (
      <Alerta tipo="aviso" titulo="Sessão necessária">
        Faça login para configurar o segundo fator de autenticação.
      </Alerta>
    );
  }

  let ehAprovador = false;
  let temMFA = false;
  try {
    ehAprovador = await papeisRepository.ehAprovador(usuario.id);
    temMFA = await papeisRepository.temMFAVerificado(usuario.id);
  } catch {
    /* tolera — UI ainda renderiza */
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-app-fg">
          Configurar segundo fator de autenticação
        </h1>
        <p className="mt-0.5 text-xs text-app-fg-muted">
          O segundo fator (TOTP) protege as operações críticas da triagem
          contra acesso indevido. Use um aplicativo autenticador como Google
          Authenticator, Microsoft Authenticator ou Authy.
        </p>
      </header>

      {ehAprovador ? (
        <Alerta tipo="info" titulo="Você é aprovador">
          {temMFA
            ? 'O seu segundo fator está configurado. Você pode adicionar fatores adicionais ou continuar normalmente.'
            : 'Aprovações, rejeições e devoluções de fichas exigem MFA verificado. Conclua a configuração abaixo antes de continuar.'}
        </Alerta>
      ) : null}

      <WizardMFA emailUsuario={usuario.email} jaConfigurado={temMFA} />

      <div className="rounded-gov-card border border-app-border-subtle bg-app-surface p-3 text-xs text-app-fg-muted">
        <p>
          Em caso de perda do dispositivo, contate o gestor para que solicite a
          remoção do fator no painel administrativo. Códigos de recuperação
          são exibidos uma única vez ao final do processo — guarde-os em local
          seguro.
        </p>
        <p className="mt-2">
          <Link href="/triagem" className="text-gov-azul hover:underline">
            Voltar para a triagem
          </Link>
        </p>
      </div>
    </div>
  );
}
