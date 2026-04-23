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
        Informe seu endereço de email institucional para receber o link de
        acesso. Acesso restrito a usuários autorizados do setor SPÁguas.
      </p>
      <FormularioLogin />
      <p className="mt-6 text-xs text-gov-muted">
        Em caso de dificuldade, contate o administrador do sistema.
      </p>
    </section>
  );
}
