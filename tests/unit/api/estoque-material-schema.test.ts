import { describe, expect, it } from 'vitest';
import { materialCriarSchema, materialPatchSchema } from '@/app/api/estoque/_schemas';

describe('api/estoque/_schemas, quantidadeMinima', () => {
  const base = { descricao: 'Cabo coaxial', natureza: 'quantificavel' as const };

  it('criar aceita inteiro >= 0', () => {
    expect(materialCriarSchema.safeParse({ ...base, quantidadeMinima: 0 }).success).toBe(true);
    expect(materialCriarSchema.safeParse({ ...base, quantidadeMinima: 50 }).success).toBe(true);
  });

  it('criar aceita ausencia (campo opcional)', () => {
    const r = materialCriarSchema.safeParse(base);
    expect(r.success).toBe(true);
  });

  it('criar aceita null (sem minimo)', () => {
    expect(materialCriarSchema.safeParse({ ...base, quantidadeMinima: null }).success).toBe(true);
  });

  it('criar rejeita negativo e nao-inteiro', () => {
    expect(materialCriarSchema.safeParse({ ...base, quantidadeMinima: -1 }).success).toBe(false);
    expect(materialCriarSchema.safeParse({ ...base, quantidadeMinima: 3.5 }).success).toBe(false);
  });

  it('patch aceita null para LIMPAR o minimo', () => {
    const r = materialPatchSchema.safeParse({ quantidadeMinima: null });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.quantidadeMinima).toBeNull();
  });

  it('patch aceita so o campo de minimo', () => {
    expect(materialPatchSchema.safeParse({ quantidadeMinima: 12 }).success).toBe(true);
  });
});
