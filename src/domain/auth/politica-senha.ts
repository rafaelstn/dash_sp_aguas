/**
 * Política de senha do sistema, cliente Governo SP.
 *
 * Mínimo 12 caracteres com mistura de ao menos 3 classes (letra, número,
 * caractere especial), alinhado ao baseline CIS para sistemas governamentais.
 * Bloqueio adicional contra senhas vazadas (haveibeenpwned) e listas comuns
 * roda no painel Supabase (Auth → Password Strength → Pwned passwords),
 * configuração de infraestrutura fora deste módulo.
 *
 * Tipo puro, sem I/O. É a fonte única da regra: reusada no cadastro
 * self-service (`/cadastrar`) e na gestão de usuários (reset de senha pelo
 * Admin/Super Admin). Nunca logar nem ecoar a senha recebida.
 */

export const SENHA_MINIMA = 12;

const SENHA_REGEX_LETRA = /[A-Za-zÀ-ÿ]/;
const SENHA_REGEX_NUMERO = /\d/;
const SENHA_REGEX_ESPECIAL = /[^A-Za-zÀ-ÿ0-9]/;

/**
 * Valida a senha contra a política. Retorna a mensagem de erro (texto PT-BR
 * pronto para exibição) quando inválida, ou `null` quando a senha passa.
 *
 * A mensagem nunca contém a senha — só descreve o requisito não atendido.
 */
export function validarSenha(senha: string): string | null {
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

/** True se a senha atende à política. Açúcar sobre {@link validarSenha}. */
export function senhaValida(senha: string): boolean {
  return validarSenha(senha) === null;
}
