'use server';

import { redirect } from 'next/navigation';
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
 * Login direto com email e senha (sem magic link). A sessão é estabelecida
 * imediatamente no cookie do Supabase Auth, e o usuário cai já dentro do
 * sistema sem precisar conferir caixa de entrada.
 *
 * Camadas de segurança aplicadas em ordem:
 *   1. Allowlist de domínio/email — bloqueia antes de tocar Supabase
 *   2. Supabase signInWithPassword — bcrypt + rate limit nativo
 *   3. Mensagem genérica em qualquer falha — não revela se email existe
 *
 * Usuários precisam ser criados manualmente no painel Supabase
 * (Authentication → Users → Add user, marcando "Auto Confirm User").
 * Self-signup é intencionalmente desativado pra projeto governo.
 */
export async function entrarComSenha(
  _estadoAnterior: ResultadoLogin | null,
  formData: FormData,
): Promise<ResultadoLogin> {
  const email = String(formData.get('email') ?? '').trim();
  const senha = String(formData.get('senha') ?? '');

  const validado = emailEstaAutorizado(email);
  if (!validado.ok) {
    return { ok: false, mensagem: mensagemErroAllowlist(validado.motivo) };
  }
  if (senha.length === 0) {
    return { ok: false, mensagem: 'Informe a senha.' };
  }

  const supabase = await criarClienteSupabaseServer();
  const { error } = await supabase.auth.signInWithPassword({
    email: email.toLowerCase(),
    password: senha,
  });

  if (error) {
    // Mensagem deliberadamente genérica — não confirma se conta existe.
    return {
      ok: false,
      mensagem: 'Email ou senha incorretos. Verifique os dados e tente novamente.',
    };
  }

  // Sessão persistida via cookie pelo Supabase. Redireciona pra home.
  redirect('/');
}
