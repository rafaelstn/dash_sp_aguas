import { getEnv } from '@/infrastructure/config/env';

export type ResultadoAllowlist =
  | { ok: true }
  | { ok: false; motivo: 'email_vazio' | 'formato_invalido' | 'dominio_nao_permitido' };

/**
 * Valida se um email pode solicitar magic link.
 *
 * Política (ADR-0004): só emails em domínios governamentais (SP/DAEE) ou em
 * lista explícita de exceções via `AUTH_EXTRA_ALLOWED_EMAILS` (ex.: consultor).
 * Validação ocorre server-side antes de qualquer chamada ao Supabase Auth —
 * nunca disparamos email pra endereço não autorizado.
 */
export function emailEstaAutorizado(email: string): ResultadoAllowlist {
  const entrada = email.trim().toLowerCase();
  if (!entrada) return { ok: false, motivo: 'email_vazio' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(entrada)) {
    return { ok: false, motivo: 'formato_invalido' };
  }

  const env = getEnv();
  const dominios = env.AUTH_ALLOWED_EMAIL_DOMAINS.split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  const emailsExtras = (env.AUTH_EXTRA_ALLOWED_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (emailsExtras.includes(entrada)) return { ok: true };

  const dominioEntrada = entrada.split('@')[1] ?? '';
  const permitido = dominios.some(
    (d) => dominioEntrada === d || dominioEntrada.endsWith(`.${d}`),
  );
  if (!permitido) return { ok: false, motivo: 'dominio_nao_permitido' };

  return { ok: true };
}

/** Mensagem formal (tom governo) para exibir ao usuário. */
export function mensagemErroAllowlist(motivo: string): string {
  switch (motivo) {
    case 'email_vazio':
      return 'Informe um endereço de email.';
    case 'formato_invalido':
      return 'Endereço de email em formato inválido.';
    case 'dominio_nao_permitido':
      return 'Acesso restrito a contas institucionais do setor SPÁguas. Contate o administrador do sistema.';
    default:
      return 'Não foi possível validar o endereço de email.';
  }
}
