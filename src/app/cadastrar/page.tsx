import Link from 'next/link';
import { FormularioCadastro } from './FormularioCadastro';

export const metadata = {
  title: 'Cadastro — Ficha Técnica de Postos Hidrológicos',
};

export default function PaginaCadastro() {
  return (
    <section className="max-w-md mx-auto" aria-labelledby="titulo-cadastro">
      <h2
        id="titulo-cadastro"
        className="text-2xl font-semibold text-gov-texto"
      >
        Criar conta
      </h2>
      <p className="mt-2 text-sm text-gov-muted">
        Cadastre-se para começar a usar o sistema. Acesso restrito a usuários
        autorizados do setor SPÁguas.
      </p>
      <FormularioCadastro />
      <p className="mt-6 text-xs text-gov-muted">
        Já tem conta?{' '}
        <Link href="/login" className="text-gov-azul hover:underline">
          Entrar
        </Link>
      </p>
    </section>
  );
}
