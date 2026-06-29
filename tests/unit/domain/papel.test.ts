import { describe, expect, it } from 'vitest';
import {
  ehAdmin,
  ehSuperAdmin,
  ehPapelValido,
  PAPEL_PADRAO,
  PAPEIS,
} from '@/domain/auth/papel';

describe('domain/auth/papel', () => {
  it('ehAdmin é verdadeiro para admin e super_admin, falso para user', () => {
    expect(ehAdmin('admin')).toBe(true);
    expect(ehAdmin('super_admin')).toBe(true);
    expect(ehAdmin('user')).toBe(false);
  });

  it('ehSuperAdmin só é verdadeiro para super_admin', () => {
    expect(ehSuperAdmin('super_admin')).toBe(true);
    expect(ehSuperAdmin('admin')).toBe(false);
    expect(ehSuperAdmin('user')).toBe(false);
  });

  it('ehPapelValido aceita só os três papéis conhecidos', () => {
    expect(ehPapelValido('super_admin')).toBe(true);
    expect(ehPapelValido('admin')).toBe(true);
    expect(ehPapelValido('user')).toBe(true);
    expect(ehPapelValido('root')).toBe(false);
    expect(ehPapelValido('')).toBe(false);
    expect(ehPapelValido(null)).toBe(false);
    expect(ehPapelValido(undefined)).toBe(false);
  });

  it('o papel padrão é o de menor privilégio (user)', () => {
    expect(PAPEL_PADRAO).toBe('user');
    expect(PAPEIS).toContain('user');
  });
});
