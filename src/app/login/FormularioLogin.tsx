'use client';

import { useActionState } from 'react';
import { enviarMagicLink, type ResultadoLogin } from './actions';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

const estadoInicial: ResultadoLogin | null = null;

export function FormularioLogin() {
  const [estado, acaoSubmit, pendente] = useActionState(enviarMagicLink, estadoInicial);

  return (
    <form action={acaoSubmit} className="mt-6 space-y-4" noValidate>
      <Input
        id="email"
        name="email"
        type="email"
        rotulo="Endereço de email"
        required
        autoComplete="email"
        aria-describedby={estado ? 'mensagem-login' : undefined}
        disabled={pendente}
      />
      <Button type="submit" disabled={pendente} className="w-full">
        {pendente ? 'Enviando…' : 'Enviar link de acesso'}
      </Button>

      {estado ? (
        <div
          id="mensagem-login"
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
