'use server';

import { redirect } from 'next/navigation';
import { criarClienteSupabaseServer } from '@/infrastructure/auth/supabase-server';
import {
  emailEstaAutorizado,
  mensagemErroAllowlist,
} from '@/infrastructure/auth/allowlist';

export interface ResultadoCadastro {
  ok: boolean;
  mensagem: string;
}

/**
 * Política de senha do cadastro self-service, cliente Governo SP.
 *
 * Mínimo 12 caracteres com mistura de 3 classes (letra, número, especial),
 * alinhado ao baseline CIS para sistemas governamentais. Bloqueio adicional
 * contra senhas vazadas (haveibeenpwned) e listas comuns roda no painel
 * Supabase (Auth → Password Strength → Pwned passwords), configuração de
 * infraestrutura fora deste arquivo.
 */
const SENHA_MINIMA = 12;
const SENHA_REGEX_LETRA = /[A-Za-zÀ-ÿ]/;
const SENHA_REGEX_NUMERO = /\d/;
const SENHA_REGEX_ESPECIAL = /[^A-Za-zÀ-ÿ0-9]/;

function validarSenha(senha: string): string | null {
  if (senha.length < SENHA_MINIMA) {
    return `Senha precisa ter no mínimo ${SENHA_MINIMA} caracteres.`;
  }
  const classes =
    Number(SENHA_REGEX_LETRA.test(senha)) +
    Number(SENHA_REGEX_NUMERO.test(senha)) +
    Number(SENHA_REGEX_ESPECIAL.test(senha));
  if (classes < 3) {
    return 'Senha precisa combinar letras, números e ao menos um caractere especial.';
  }
  return null;
}

/**
 * Cadastro self-service de usuário com email + senha + nome.
 *
 * O nome é gravado em `user_metadata` do Supabase Auth (campo `data` em
 * `signUp.options`). É lido depois pelo `obterUsuarioAtual` e exibido na
 * sidenav. Usuário pode atualizá-lo no futuro via tela de perfil.
 *
 * Pré-requisitos no painel Supabase:
 *   - Authentication → Providers → Email habilitado
 *   - Authentication → Email Auth → "Confirm email" DESMARCADO
 *     (senão o signUp completa mas a sessão não é criada,
 *     usuário fica em estado "unconfirmed" até clicar no link do email)
 *
 * Allowlist é aplicada antes de tocar Supabase — mesma camada do login.
 * Em modo demo (`AUTH_ALLOWED_EMAIL_DOMAINS=*`) qualquer domínio passa.
 */
export async function cadastrar(
  _estadoAnterior: ResultadoCadastro | null,
  formData: FormData,
): Promise<ResultadoCadastro> {
  const nome = String(formData.get('nome') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();
  const senha = String(formData.get('senha') ?? '');

  if (nome.length < 2) {
    return {
      ok: false,
      mensagem: 'Informe seu nome (mínimo 2 caracteres).',
    };
  }
  const erroSenha = validarSenha(senha);
  if (erroSenha) {
    return { ok: false, mensagem: erroSenha };
  }

  const validado = emailEstaAutorizado(email);
  if (!validado.ok) {
    return { ok: false, mensagem: mensagemErroAllowlist(validado.motivo) };
  }

  const supabase = await criarClienteSupabaseServer();
  const { data, error } = await supabase.auth.signUp({
    email: email.toLowerCase(),
    password: senha,
    options: {
      data: { nome },
    },
  });

  if (error) {
    // Mensagens comuns: "User already registered", "Password should be at least 6 characters"
    const msg = error.message.toLowerCase();
    if (msg.includes('already')) {
      return {
        ok: false,
        mensagem: 'Este email já está cadastrado. Entre na tela de login.',
      };
    }
    return {
      ok: false,
      mensagem: 'Não foi possível concluir o cadastro. Tente novamente em instantes.',
    };
  }

  // Se "Confirm email" estiver ATIVO no Supabase, signUp completa mas
  // não cria sessão — usuário precisa clicar no link do email. Detectamos
  // pela ausência de session e devolvemos uma mensagem amigável em vez
  // de redirecionar pra home (onde o middleware ia mandar de volta pra login).
  if (!data.session) {
    return {
      ok: true,
      mensagem:
        'Cadastro recebido. Confirme o link enviado para seu email para começar a usar o sistema.',
    };
  }

  redirect('/');
}
