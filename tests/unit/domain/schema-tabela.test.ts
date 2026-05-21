import { describe, it, expect } from 'vitest';
import { construirSchemaZodEstrito } from '@/domain/fichas/schemas';

/**
 * Cobre o tipo de campo `tabela` (verticais da medição de vazão, tipo 7):
 * o Zod estrito deve aceitar linhas válidas e rejeitar célula mal tipada,
 * coluna fora do schema e valor abaixo do mínimo.
 */
describe('schema tabela — verticais (tipo 7)', () => {
  const schema = construirSchemaZodEstrito(7);

  it('aceita verticais válidas (células parcialmente preenchidas)', () => {
    const r = schema.safeParse({
      verticais: [
        { distancia_m: 6.5, profundidade_m: 0, rot_06h: 0 },
        { distancia_m: 7, profundidade_m: 0.1, rot_06h: 49 },
      ],
    });
    expect(r.success).toBe(true);
  });

  it('aceita tabela vazia', () => {
    expect(schema.safeParse({ verticais: [] }).success).toBe(true);
  });

  it('rejeita célula numérica com valor não-numérico', () => {
    const r = schema.safeParse({ verticais: [{ distancia_m: 'abc' }] });
    expect(r.success).toBe(false);
  });

  it('rejeita coluna fora do schema na linha (strict)', () => {
    const r = schema.safeParse({ verticais: [{ distancia_m: 1, coluna_fantasma: 1 }] });
    expect(r.success).toBe(false);
  });

  it('rejeita profundidade negativa (min 0)', () => {
    const r = schema.safeParse({ verticais: [{ profundidade_m: -1 }] });
    expect(r.success).toBe(false);
  });
});
