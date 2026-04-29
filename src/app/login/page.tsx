import Link from 'next/link';
import { FormularioLogin } from './FormularioLogin';

export const metadata = {
  title: 'Acesso — Ficha Técnica de Postos Hidrológicos',
};

export default function PaginaLogin() {
  return (
    <section className="max-w-md mx-auto" aria-labelledby="titulo-login">
      <h2 id="titulo-login" className="text-2xl font-semibold text-gov-texto">
        Acesso ao sistema
      </h2>
      <p className="mt-2 text-sm text-gov-muted">
        Informe seu email e senha cadastrados. Acesso restrito a usuários
        autorizados do setor SPÁguas.
      </p>
      <FormularioLogin />
      <p className="mt-6 text-sm text-gov-muted">
        Ainda não tem conta?{' '}
        <Link href="/cadastrar" className="text-gov-azul hover:underline">
          Criar conta
        </Link>
      </p>
      <p className="mt-2 text-xs text-gov-muted">
        Em caso de dificuldade de acesso ou esquecimento de senha, contate o
        administrador do sistema.
      </p>
    </section>
  );
}
