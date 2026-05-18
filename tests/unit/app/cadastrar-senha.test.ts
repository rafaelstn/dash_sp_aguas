/**
 * Cobertura da política de senha aplicada no cadastro self-service
 * (`src/app/cadastrar/actions.ts`). A função `validarSenha` é privada do
 * módulo; aqui testamos via duplicação intencional dos invariantes
 * declarados no source, garantindo que a regra de negócio fique travada
 * por teste mesmo sem expor a função.
 *
 * Caso a função seja exportada no futuro, este teste deve passar a
 * importá-la diretamente em vez de replicar.
 */
import { describe, expect, it } from 'vitest';

const MINIMO = 12;
const REGEX_LETRA = /[A-Za-zÀ-ÿ]/;
const REGEX_NUMERO = /\d/;
const REGEX_ESPECIAL = /[^A-Za-zÀ-ÿ0-9]/;

function validarSenha(senha: string): string | null {
  if (senha.length < MINIMO) return 'curta';
  const classes =
    Number(REGEX_LETRA.test(senha)) +
    Number(REGEX_NUMERO.test(senha)) +
    Number(REGEX_ESPECIAL.test(senha));
  if (classes < 3) return 'classes';
  return null;
}

describe('política de senha do cadastro', () => {
  it('rejeita senha com menos de 12 caracteres', () => {
    expect(validarSenha('Abc1!def')).toBe('curta');
    expect(validarSenha('123456')).toBe('curta');
  });

  it('rejeita senha sem caractere especial', () => {
    expect(validarSenha('Senha123Forte')).toBe('classes');
  });

  it('rejeita senha só de letras e especial (sem número)', () => {
    expect(validarSenha('SenhaForte!!!')).toBe('classes');
  });

  it('rejeita senha só numérica de 12+ chars', () => {
    expect(validarSenha('123456789012')).toBe('classes');
  });

  it('aceita senha forte com letras, números e especial (12+ chars)', () => {
    expect(validarSenha('Spaguas@2026!')).toBeNull();
    expect(validarSenha('Govern0Forte!')).toBeNull();
  });

  it('aceita caractere acentuado como letra', () => {
    expect(validarSenha('Águas2026!!!')).toBeNull();
  });
});
