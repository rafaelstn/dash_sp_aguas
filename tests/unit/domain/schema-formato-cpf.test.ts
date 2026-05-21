import { describe, it, expect } from 'vitest';
import { cpfValido, construirSchemaZodEstrito } from '@/domain/fichas/schemas';

describe('formato CPF — dígito verificador', () => {
  it('aceita CPF válido', () => {
    expect(cpfValido('111.444.777-35')).toBe(true);
    expect(cpfValido('11144477735')).toBe(true);
  });

  it('rejeita dígito verificador errado', () => {
    expect(cpfValido('123.456.789-00')).toBe(false);
  });

  it('rejeita sequência de dígitos iguais', () => {
    expect(cpfValido('111.111.111-11')).toBe(false);
  });

  it('rejeita comprimento inválido', () => {
    expect(cpfValido('123')).toBe(false);
  });

  describe('na Troca de Observador (tipo 6)', () => {
    const schema = construirSchemaZodEstrito(6);

    it('aceita CPF válido com nome', () => {
      const r = schema.safeParse({ novo_nome: 'João', novo_cpf: '111.444.777-35' });
      expect(r.success).toBe(true);
    });

    it('rejeita CPF com dígito verificador inválido', () => {
      const r = schema.safeParse({ novo_nome: 'João', novo_cpf: '123.456.789-00' });
      expect(r.success).toBe(false);
    });

    it('aceita CPF vazio (campo opcional)', () => {
      const r = schema.safeParse({ novo_nome: 'João' });
      expect(r.success).toBe(true);
    });
  });
});
