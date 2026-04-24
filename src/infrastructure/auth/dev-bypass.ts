/**
 * Bypass de autenticação exclusivo para desenvolvimento local.
 *
 * Duas guards obrigatórias:
 *   1. NODE_ENV === 'development' (Next.js garante isso em `next dev`).
 *   2. DEV_BYPASS_AUTH_EMAIL presente no ambiente.
 *
 * Em produção qualquer valor é ignorado — o middleware e o current-user
 * continuam exigindo sessão real do Supabase, mesmo se as vars vazarem.
 *
 * .env.local:
 *   DEV_BYPASS_AUTH_EMAIL=rafael@rafaeldamasceno.dev
 *   DEV_BYPASS_AUTH_USER_ID=<uuid-real-do-auth.users>   # obrigatório
 *
 * Como obter o UUID:
 *   SELECT id FROM auth.users WHERE email = '<seu-email>';
 */

export interface UsuarioBypassDev {
  id: string;
  email: string;
}

// UUID v1..v5 (formato canônico 8-4-4-4-12). Rejeita qualquer outra string.
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function bypassAuthAtivo(): boolean {
  return (
    process.env.NODE_ENV === 'development' &&
    Boolean(process.env.DEV_BYPASS_AUTH_EMAIL?.trim())
  );
}

export function obterUsuarioBypassDev(): UsuarioBypassDev | null {
  if (!bypassAuthAtivo()) return null;

  const email = process.env.DEV_BYPASS_AUTH_EMAIL!.trim();
  const id = process.env.DEV_BYPASS_AUTH_USER_ID?.trim();

  // Fail-fast: sem UUID válido, operações que dependem de FK pra auth.users
  // (favoritos, revisoes_desconformidade, etc.) quebram com PostgresError
  // "invalid input syntax for type uuid" no meio do fluxo — mensagem opaca
  // pro dev. Prefiro estourar no boot da request com diagnóstico claro.
  if (!id || !UUID_REGEX.test(id)) {
    throw new Error(
      'DEV_BYPASS_AUTH_USER_ID ausente ou não é UUID válido. ' +
        `Valor atual: ${JSON.stringify(id ?? null)}. ` +
        'Obtenha rodando no Supabase SQL Editor: ' +
        `SELECT id FROM auth.users WHERE email = '${email}'; ` +
        'e cole o resultado em .env.local como DEV_BYPASS_AUTH_USER_ID=<uuid>.',
    );
  }

  return { id, email };
}
