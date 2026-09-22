import { describe, expect, it } from 'vitest';
import { linhasDeLocal, municipioComUf } from '@/components/features/postos/mapa/local-posto';

/**
 * Texto de localização da lista, da dica do mapa e do detalhe. O posto de
 * outro estado tem de dizer de onde é, e o de SP não repete a sigla.
 */
describe('localização do posto em texto', () => {
  it('posto de SP mostra município e UGRHI, sem a sigla', () => {
    expect(linhasDeLocal({ municipio: 'CAMPINAS', uf: 'SP', ugrhi: 5 })[0]).toBe('CAMPINAS');
    expect(linhasDeLocal({ municipio: 'CAMPINAS', uf: 'SP', ugrhi: 5 })).toHaveLength(2);
  });

  it('posto de SP sem UGRHI diz isso; posto de outro estado não repete "Sem UGRHI"', () => {
    expect(linhasDeLocal({ municipio: null, uf: 'SP', ugrhi: null })).toHaveLength(1);
    expect(linhasDeLocal({ municipio: 'LONDRINA', uf: 'PR', ugrhi: null })).toEqual(['LONDRINA, PR']);
  });

  it('sem município, a UF de fora ainda aparece; sem nada, nada', () => {
    expect(municipioComUf({ municipio: null, uf: 'MG' })).toBe('MG');
    expect(municipioComUf({ municipio: null, uf: null })).toBeNull();
    expect(linhasDeLocal({ municipio: null, uf: null, ugrhi: null })).toEqual([]);
  });
});
