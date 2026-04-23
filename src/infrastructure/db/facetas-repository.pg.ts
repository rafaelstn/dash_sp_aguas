import 'server-only';
import type {
  FacetasPostos,
  FacetasRepository,
} from '@/application/ports/facetas-repository';
import { FalhaRepositorio } from '@/domain/errors';
import { sql } from './client';

// Cache em memória por processo — dataset muda raramente (só quando
// importer roda). TTL 10 min suficiente.
const TTL_MS = 10 * 60 * 1000;
let cache: { em: number; dados: FacetasPostos } | null = null;

export const facetasRepository: FacetasRepository = {
  async listar() {
    const agora = Date.now();
    if (cache && agora - cache.em < TTL_MS) {
      return cache.dados;
    }
    try {
      const [ugrhis, municipios, bacias, tiposPosto] = await Promise.all([
        sql<{ numero: string; nome: string; total: string }[]>`
          SELECT ugrhi_numero AS numero,
                 ugrhi_nome   AS nome,
                 COUNT(*)::text AS total
            FROM postos
           WHERE ugrhi_numero IS NOT NULL AND ugrhi_numero <> ''
           GROUP BY ugrhi_numero, ugrhi_nome
           ORDER BY ugrhi_numero
        `,
        sql<{ nome: string; total: string }[]>`
          SELECT municipio AS nome, COUNT(*)::text AS total
            FROM postos
           WHERE municipio IS NOT NULL AND municipio <> ''
           GROUP BY municipio
           ORDER BY municipio
        `,
        sql<{ nome: string; total: string }[]>`
          SELECT bacia_hidrografica AS nome, COUNT(*)::text AS total
            FROM postos
           WHERE bacia_hidrografica IS NOT NULL AND bacia_hidrografica <> ''
           GROUP BY bacia_hidrografica
           ORDER BY bacia_hidrografica
        `,
        sql<{ codigo: string; total: string }[]>`
          SELECT tipo_posto AS codigo, COUNT(*)::text AS total
            FROM postos
           WHERE tipo_posto IS NOT NULL AND tipo_posto <> ''
           GROUP BY tipo_posto
           ORDER BY tipo_posto
        `,
      ]);

      const dados: FacetasPostos = {
        ugrhis: ugrhis.map((r) => ({
          numero: r.numero,
          nome: r.nome,
          total: Number(r.total),
        })),
        municipios: municipios.map((r) => ({
          nome: r.nome,
          total: Number(r.total),
        })),
        bacias: bacias.map((r) => ({
          nome: r.nome,
          total: Number(r.total),
        })),
        tiposPosto: tiposPosto.map((r) => ({
          codigo: r.codigo,
          total: Number(r.total),
        })),
      };

      cache = { em: agora, dados };
      return dados;
    } catch (e) {
      throw new FalhaRepositorio('facetas.listar', e);
    }
  },
};
