import { describe, it, expect } from 'vitest';
import { validarReturnToInterno } from '@/infrastructure/auth/return-to';

describe('validarReturnToInterno', () => {
  it('aceita path interno simples', () => {
    expect(validarReturnToInterno('/app')).toBe('/app');
    expect(validarReturnToInterno('/app/postos')).toBe('/app/postos');
    expect(validarReturnToInterno('/triagem')).toBe('/triagem');
  });

  it('aceita path interno com query string', () => {
    expect(validarReturnToInterno('/app/postos?tipo=3')).toBe(
      '/app/postos?tipo=3',
    );
  });

  it('rejeita ausência (null, undefined, vazio)', () => {
    expect(validarReturnToInterno(null)).toBeNull();
    expect(validarReturnToInterno(undefined)).toBeNull();
    expect(validarReturnToInterno('')).toBeNull();
  });

  it('rejeita URL externa', () => {
    expect(validarReturnToInterno('https://evil.com')).toBeNull();
    expect(validarReturnToInterno('http://evil.com/app')).toBeNull();
  });

  it('rejeita protocol-relative (//host)', () => {
    expect(validarReturnToInterno('//evil.com')).toBeNull();
    expect(validarReturnToInterno('//evil.com/app')).toBeNull();
  });

  it('rejeita backslash (escape em browsers Windows)', () => {
    expect(validarReturnToInterno('/\\evil.com')).toBeNull();
    expect(validarReturnToInterno('/app\\..\\admin')).toBeNull();
  });

  it('rejeita path que não começa com /', () => {
    expect(validarReturnToInterno('app')).toBeNull();
    expect(validarReturnToInterno('javascript:alert(1)')).toBeNull();
  });

  it('regressão: técnico que volta do /auth/sair preserva destino /app', () => {
    expect(validarReturnToInterno('/app')).toBe('/app');
  });
});
