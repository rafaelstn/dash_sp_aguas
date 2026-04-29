'use client';

import { useActionState } from 'react';
import { cadastrar, type ResultadoCadastro } from './actions';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

const estadoInicial: ResultadoCadastro | null = null;

/**
 * Form de cadastro self-service. Em sucesso (sessão criada), Server Action
 * redireciona pra `/` — o componente nem renderiza estado de sucesso. Em
 * erro ou em "precisa confirmar email", mostra mensagem persistente.
 */
export function FormularioCadastro() {
  const [estado, acaoSubmit, pendente] = useActionState(
    cadastrar,
    estadoInicial,
  );

  return (
    <form action={acaoSubmit} className="mt-6 space-y-4" noValidate>
      <Input
        id="nome"
        name="nome"
        type="text"
        rotulo="Nome completo"
        required
        autoComplete="name"
        minLength={2}
        aria-describedby={estado ? 'mensagem-cadastro' : undefined}
        disabled={pendente}
      />
      <Input
        id="email"
        name="email"
        type="email"
        rotulo="Email"
        required
        autoComplete="email"
        aria-describedby={estado ? 'mensagem-cadastro' : undefined}
        disabled={pendente}
      />
      <Input
        id="senha"
        name="senha"
        type="password"
        rotulo="Senha"
        descricao="Mínimo 6 caracteres."
        required
        autoComplete="new-password"
        minLength={6}
        aria-describedby={estado ? 'mensagem-cadastro' : undefined}
        disabled={pendente}
      />
      <Button type="submit" disabled={pendente} className="w-full">
        {pendente ? 'Cadastrando…' : 'Criar conta'}
      </Button>

      {estado ? (
        <div
          id="mensagem-cadastro"
          role={estado.ok ? 'status' : 'alert'}
          aria-live="polite"
          className={
            'rounded-md border px-3 py-2 text-sm ' +
            (estado.ok
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
              : 'border-red-300 bg-red-50 text-red-900')
          }
        >
          {estado.mensagem}
        </div>
      ) : null}
    </form>
  );
}
