'use client';

import { useActionState } from 'react';
import { entrarComSenha, type ResultadoLogin } from './actions';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

const estadoInicial: ResultadoLogin | null = null;

/**
 * Form de login email + senha. Usa Server Action `entrarComSenha` —
 * em sucesso, o action redireciona pra `/` (não retorna nada pro estado).
 * Em erro, devolve `ResultadoLogin` que renderizamos abaixo do botão.
 */
export function FormularioLogin() {
  const [estado, acaoSubmit, pendente] = useActionState(
    entrarComSenha,
    estadoInicial,
  );

  return (
    <form action={acaoSubmit} className="mt-6 space-y-4" noValidate>
      <Input
        id="email"
        name="email"
        type="email"
        rotulo="Email"
        required
        autoComplete="email"
        aria-describedby={estado ? 'mensagem-login' : undefined}
        disabled={pendente}
      />
      <Input
        id="senha"
        name="senha"
        type="password"
        rotulo="Senha"
        required
        autoComplete="current-password"
        aria-describedby={estado ? 'mensagem-login' : undefined}
        disabled={pendente}
      />
      <Button type="submit" disabled={pendente} className="w-full">
        {pendente ? 'Entrando…' : 'Entrar'}
      </Button>

      {estado && !estado.ok ? (
        <div
          id="mensagem-login"
          role="alert"
          aria-live="polite"
          className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900"
        >
          {estado.mensagem}
        </div>
      ) : null}
    </form>
  );
}
