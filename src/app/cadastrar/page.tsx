import Link from 'next/link';
import Image from 'next/image';
import { FormularioCadastro } from './FormularioCadastro';

export const metadata = {
  title: 'Cadastro — Ficha Técnica de Postos Hidrológicos',
};

export default function PaginaCadastro() {
  return (
    <main
      id="conteudo-principal"
      className="flex min-h-screen items-center justify-center px-4 py-10"
    >
      <section
        aria-labelledby="titulo-cadastro"
        className="w-full max-w-md rounded-gov-card border border-app-border-subtle bg-app-surface p-6 shadow-gov-card sm:p-8"
      >
        <div className="flex items-center gap-3 border-b border-app-border-subtle pb-4">
          <Image
            src="/logo-spaguas.png"
            alt=""
            width={40}
            height={40}
            priority
            className="h-10 w-auto"
          />
          <div className="leading-tight">
            <p className="text-2xs uppercase tracking-wider text-app-fg-muted">
              Governo do Estado de SP
            </p>
            <p className="text-sm font-semibold text-app-fg">
              SPÁguas · Ficha Técnica
            </p>
          </div>
        </div>

        <h2
          id="titulo-cadastro"
          className="mt-5 text-2xl font-semibold text-gov-texto"
        >
          Criar conta
        </h2>
        <p className="mt-2 text-sm text-gov-muted">
          Cadastre-se para começar a usar o sistema.
        </p>
        <FormularioCadastro />
        <p className="mt-6 text-sm text-gov-muted">
          Já tem conta?{' '}
          <Link href="/login" className="text-gov-azul hover:underline">
            Entrar
          </Link>
        </p>
      </section>
    </main>
  );
}
