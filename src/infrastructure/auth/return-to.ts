/**
 * Valida e normaliza o parâmetro `returnTo` usado no fluxo de
 * login/logout/cadastro. Aceita apenas paths internos do próprio site,
 * bloqueando open redirect (URLs externas, protocol-relative `//host`, ou
 * tentativas de escape via backslash em browsers Windows).
 *
 * Centralizado aqui porque o destino do pós-login é regressão recorrente
 * (técnico que clica "Sair" no app de campo caía no dashboard web por falta
 * de propagação consistente do returnTo entre route handler, server action e
 * middleware).
 *
 * Retorna o path se válido, ou `null` se inválido ou ausente.
 */
export function validarReturnToInterno(valor: string | null | undefined): string | null {
  if (!valor) return null;
  if (typeof valor !== 'string') return null;
  if (!valor.startsWith('/')) return null;
  if (valor.startsWith('//')) return null;
  if (valor.includes('\\')) return null;
  return valor;
}
