/**
 * Cobertura da política de senha do sistema (regra compartilhada entre o
 * cadastro e o reset de senha pelo Admin). Importa a função REAL de
 * `src/domain/auth/politica-senha.ts` — se alguém afrouxar a regra (ex.: baixar
 * o mínimo de 12), estes testes quebram. (Antes este teste reimplementava a
 * lógica e não protegia contra regressão; corrigido.)
 */
import { describe, expect, it } from 'vitest';
import {
  validarSenha,
  senhaValida,
  SENHA_MINIMA,
} from '@/domain/auth/politica-senha';

describe('domain/auth/politica-senha', () => {
  it('o mínimo da política é 12 caracteres', () => {
    expect(SENHA_MINIMA).toBe(12);
  });

  it('rejeita senha com menos de 12 caracteres (mensagem sobre tamanho, sem ecoar a senha)', () => {
    const msg = validarSenha('Abc1!def');
    expect(msg).not.toBeNull();
    expect(msg).toContain('12');
    expect(msg).not.toContain('Abc1!def');
    expect(validarSenha('123456')).not.toBeNull();
  });

  it('rejeita senha sem caractere especial (menos de 3 classes)', () => {
    expect(validarSenha('Senha123Forte')).toContain('combinar');
  });

  it('rejeita senha só de letras e especial (sem número)', () => {
    expect(validarSenha('SenhaForte!!!')).toContain('combinar');
  });

  it('rejeita senha só numérica de 12+ chars', () => {
    expect(validarSenha('123456789012')).toContain('combinar');
  });

  it('aceita senha forte com letras, números e especial (12+ chars)', () => {
    expect(validarSenha('Spaguas@2026!')).toBeNull();
    expect(validarSenha('Govern0Forte!')).toBeNull();
  });

  it('aceita caractere acentuado como letra', () => {
    expect(validarSenha('Águas2026!!!')).toBeNull();
  });

  it('senhaValida é o açúcar booleano de validarSenha', () => {
    expect(senhaValida('Spaguas@2026!')).toBe(true);
    expect(senhaValida('fraca')).toBe(false);
  });
});
