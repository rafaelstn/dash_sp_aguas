import 'server-only';
import type {
  FacetasPostos,
  FacetasRepository,
} from '@/application/ports/facetas-repository';
import { POSTOS_FIXTURES } from './fixtures';

/** Adapter in-memory de FacetasRepository (MODO DEMO). */

function contarPor<T>(
  arr: T[],
  chave: (t: T) => string | null,
): Array<{ nome: string; total: number }> {
  const mapa = new Map<string, number>();
  for (const item of arr) {
    const k = chave(item);
    if (!k) continue;
    mapa.set(k, (mapa.get(k) ?? 0) + 1);
  }
  return Array.from(mapa.entries())
    .map(([nome, total]) => ({ nome, total }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
}

export const facetasRepository: FacetasRepository = {
  async listar(): Promise<FacetasPostos> {
    const ugrhiMap = new Map<string, { numero: string; nome: string; total: number }>();
    for (const p of POSTOS_FIXTURES) {
      if (!p.ugrhiNumero) continue;
      const ja = ugrhiMap.get(p.ugrhiNumero);
      if (ja) {
        ja.total += 1;
      } else {
        ugrhiMap.set(p.ugrhiNumero, {
          numero: p.ugrhiNumero,
          nome: p.ugrhiNome ?? p.ugrhiNumero,
          total: 1,
        });
      }
    }

    const tiposMap = new Map<string, number>();
    for (const p of POSTOS_FIXTURES) {
      if (!p.tipoPosto) continue;
      tiposMap.set(p.tipoPosto, (tiposMap.get(p.tipoPosto) ?? 0) + 1);
    }

    return {
      ugrhis: Array.from(ugrhiMap.values()).sort((a, b) =>
        a.numero.localeCompare(b.numero),
      ),
      municipios: contarPor(POSTOS_FIXTURES, (p) => p.municipio),
      bacias: contarPor(POSTOS_FIXTURES, (p) => p.baciaHidrografica),
      tiposPosto: Array.from(tiposMap.entries())
        .map(([codigo, total]) => ({ codigo, total }))
        .sort((a, b) => a.codigo.localeCompare(b.codigo)),
    };
  },
};
