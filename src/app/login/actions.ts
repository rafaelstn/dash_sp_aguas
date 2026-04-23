'use server';

import { headers } from 'next/headers';
import { criarClienteSupabaseServer } from '@/infrastructure/auth/supabase-server';
import {
  emailEstaAutorizado,
  mensagemErroAllowlist,
} from '@/infrastructure/auth/allowlist';

export interface ResultadoLogin {
  ok: boolean;
  mensagem: string;
}

/**
 * Envia magic link por email. Valida allowlist antes de invocar Supabase
 * para nunca disparar mensagem a endereço não autorizado.
 *
 * Retorna mensagem genérica em caso de sucesso para não vazar se o email
 * existe ou não na base de usuários (mitigação de enumeração).
 */
export async function enviarMagicLink(
  _estadoAnterior: ResultadoLogin | null,
  formData: FormData,
): Promise<ResultadoLogin> {
  const email = String(formData.get('email') ?? '').trim();

  const validado = emailEstaAutorizado(email);
  if (!validado.ok) {
    return { ok: false, mensagem: mensagemErroAllowlist(validado.motivo) };
  }

  const supabase = await criarClienteSupabaseServer();
  const h = await headers();
  const origin = h.get('origin') ?? h.get('host') ?? '';
  const baseUrl = origin.startsWith('http') ? origin : `https://${origin}`;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${baseUrl}/auth/callback`,
      shouldCreateUser: true,
    },
  });

  if (error) {
    return {
      ok: false,
      mensagem:
        'Não foi possível enviar o link de acesso. Tente novamente em instantes.',
    };
  }

  return {
    ok: true,
    mensagem:
      'Se o endereço estiver cadastrado, enviaremos um link de acesso. Confira sua caixa de entrada.',
  };
}
