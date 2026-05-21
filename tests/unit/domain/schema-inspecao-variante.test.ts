import { describe, it, expect } from 'vitest';
import {
  construirSchemaZodEstrito,
  obterSchema,
  secaoVisivel,
} from '@/domain/fichas/schemas';

/**
 * Inspeção (tipo 3) tem duas variantes no mesmo schema, escolhidas por
 * `tipo_inspecao`. As seções condicionais só valem na variante certa, e
 * `secaoVisivel` deve refletir isso.
 */
describe('inspeção (tipo 3) — variantes fluviométrica e pluviométrica', () => {
  const schema = construirSchemaZodEstrito(3);

  it('aceita payload da variante fluviométrica', () => {
    const r = schema.safeParse({
      tipo_inspecao: 'fluviometrica',
      escala_acesso: 'bom',
      limn_pena: 'bom',
    });
    expect(r.success).toBe(true);
  });

  it('aceita payload da variante pluviométrica', () => {
    const r = schema.safeParse({
      tipo_inspecao: 'pluviometrica',
      pluv_nivelamento: 'bom',
      cadp_granizo: 'sim',
    });
    expect(r.success).toBe(true);
  });

  it('rejeita sem tipo_inspecao (obrigatório)', () => {
    expect(schema.safeParse({ escala_acesso: 'bom' }).success).toBe(false);
  });

  it('secaoVisivel respeita a variante escolhida', () => {
    const { secoes } = obterSchema(3);
    const pluviografo = secoes.find((s) => s.titulo === 'Pluviógrafo')!;
    const escalas = secoes.find((s) => s.titulo === 'Escalas')!;
    const identificacao = secoes.find((s) => s.titulo === 'Identificação')!;

    expect(secaoVisivel(pluviografo, { tipo_inspecao: 'pluviometrica' })).toBe(true);
    expect(secaoVisivel(pluviografo, { tipo_inspecao: 'fluviometrica' })).toBe(false);
    expect(secaoVisivel(escalas, { tipo_inspecao: 'fluviometrica' })).toBe(true);
    // Seção comum (sem `quando`) é sempre visível.
    expect(secaoVisivel(identificacao, {})).toBe(true);
  });
});
