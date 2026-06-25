'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { criarClienteSupabaseServer } from '@/infrastructure/auth/supabase-server';
import {
  emailEstaAutorizado,
  mensagemErroAllowlist,
} from '@/infrastructure/auth/allowlist';
import { validarReturnToInterno } from '@/infrastructure/auth/return-to';
import {
  POLITICAS,
  consumirRateLimit,
  extrairIpDeHeaders,
} from '@/infrastructure/security/rate-limit';
import { logger } from '@/infrastructure/logging/logger';

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

  // Defesa em profundidade contra brute-force (SEG-3): rate limit aplicacional
  // por IP e por email, somado ao limite nativo do Supabase. Falha fechada com
  // mensagem genérica (não revela qual limite estourou nem se a conta existe).
  const ip = extrairIpDeHeaders(await headers());
  const emailNormalizado = email.toLowerCase();
  const rlIp = consumirRateLimit(POLITICAS.loginIp, ip);
  const rlEmail = consumirRateLimit(POLITICAS.loginEmail, emailNormalizado);
  if (!rlIp.permitido || !rlEmail.permitido) {
    logger.security(
      'seg.login.rate_limited',
      { ip, porIp: !rlIp.permitido, porEmail: !rlEmail.permitido },
      'Tentativa de login bloqueada por rate limit',
    );
    return {
      ok: false,
      mensagem: 'Muitas tentativas de acesso. Aguarde um instante e tente novamente.',
    };
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

  // Volta para a origem (ex.: o app de campo em /app); home do sistema por
  // padrão. Quem entra pelo app continua no app, não cai no dashboard.
  redirect(validarReturnToInterno(String(formData.get('returnTo') ?? '')) ?? '/');
}
