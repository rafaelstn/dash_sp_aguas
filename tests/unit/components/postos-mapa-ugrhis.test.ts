import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { NOMES_UGRHI } from '@/components/features/postos/mapa/ugrhis';

/**
 * A tela escreve o nome da UGRHI a partir de `ugrhis.ts`, e o mapa desenha a
 * geometria de `public/geo/ugrhis-sp.json`. Se alguém regerar a geometria com
 * outra lista, ou corrigir um nome só num lugar, o filtro e o mapa passam a
 * chamar a mesma área por nomes diferentes. Este caso reprova isso.
 */

interface Colecao {
  features: Array<{
    properties: { codigo: number; nome: string };
    geometry: { type: string; coordinates: unknown[] };
  }>;
}

function lerGeo(nome: string): Colecao {
  const arquivo = path.resolve(__dirname, '../../../public/geo', nome);
  return JSON.parse(readFileSync(arquivo, 'utf8')) as Colecao;
}

describe('geometria estática das UGRHIs', () => {
  it('tem as 22 UGRHIs, com os mesmos nomes da tela', () => {
    const geo = lerGeo('ugrhis-sp.json');
    expect(geo.features).toHaveLength(22);
    const doArquivo = Object.fromEntries(
      geo.features.map((f) => [f.properties.codigo, f.properties.nome]),
    );
    expect(doArquivo).toEqual(NOMES_UGRHI);
  });

  it('toda feição tem polígono desenhável', () => {
    for (const f of lerGeo('ugrhis-sp.json').features) {
      expect(f.geometry.type).toBe('MultiPolygon');
      expect(f.geometry.coordinates.length).toBeGreaterThan(0);
    }
  });

  it('o limite do estado existe e é um polígono', () => {
    const limite = lerGeo('limite-sp.json');
    expect(limite.features).toHaveLength(1);
    expect(limite.features[0]!.geometry.type).toBe('MultiPolygon');
  });
});
