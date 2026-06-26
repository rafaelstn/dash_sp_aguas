import Link from 'next/link';
import Image from 'next/image';
import { FormularioLogin } from './FormularioLogin';

export const metadata = {
  title: 'Acesso — Ficha Técnica de Postos Hidrológicos',
};

export default async function PaginaLogin({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { returnTo } = await searchParams;
  const ehApp = typeof returnTo === 'string' && returnTo.startsWith('/app');

  return (
    <main
      id="conteudo-principal"
      className="flex min-h-screen items-center justify-center px-4 py-10"
    >
      <section
        aria-labelledby="titulo-login"
        className="w-full max-w-md rounded-gov-card border border-app-border-subtle bg-app-surface p-6 shadow-gov-card sm:p-8"
      >
        <div className="flex items-center gap-3 border-b border-app-border-subtle pb-4">
          <Image
            src="/logo-spaguas-header.png"
            alt=""
            width={178}
            height={100}
            unoptimized
            priority
            className="h-12 w-auto"
          />
          <div className="leading-tight">
            <p className="text-2xs uppercase tracking-wider text-app-fg-muted">
              Governo do Estado de SP
            </p>
            <p className="text-sm font-semibold text-app-fg">
              SP Águas - DMO
            </p>
          </div>
        </div>

        <h2
          id="titulo-login"
          className="mt-5 text-2xl font-semibold text-gov-texto"
        >
          {ehApp ? 'Acesso ao aplicativo de campo' : 'Acesso ao sistema'}
        </h2>
        <p className="mt-2 text-sm text-gov-muted">
          Informe seu email e senha cadastrados.
        </p>
        <FormularioLogin returnTo={returnTo} />
        <p className="mt-6 text-sm text-gov-muted">
          Ainda não tem conta?{' '}
          <Link
            href="/cadastrar"
            className="text-gov-azul underline underline-offset-2"
          >
            Criar conta
          </Link>
        </p>
        <p className="mt-2 text-xs text-gov-muted">
          Em caso de dificuldade de acesso, contate o administrador do sistema.
        </p>
      </section>
    </main>
  );
}
