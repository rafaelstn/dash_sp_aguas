import 'server-only';

import type {
  ParametrosPesquisa,
  PostosRepository,
  ResultadoPesquisa,
} from '@/application/ports/postos-repository';
import type { Posto } from '@/domain/posto';
import { POSTOS_FIXTURES } from './fixtures';

/**
 * Adapter in-memory de PostosRepository (MODO DEMO).
 * Comportamento equivalente ao .pg, sem tocar em banco.
 */

function normalizar(texto: string): string {
  // Remove marcas de acentuação (diacríticos Unicode) sem depender de caracteres
  // combinantes literais no source, que ficam frágeis em sistemas Windows.
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function combinaTermo(posto: Posto, termoNormalizado: string): boolean {
  const campos = [
    posto.prefixo,
    posto.prefixoAna,
    posto.nomeEstacao,
    posto.municipio,
    posto.municipioAlt,
    posto.baciaHidrografica,
    posto.ugrhiNome,
    posto.subUgrhiNome,
    posto.tipoPosto,
  ];
  return campos
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .some((v) => normalizar(v).includes(termoNormalizado));
}

function ordenarPorPrefixo(a: Posto, b: Posto): number {
  return a.prefixo.localeCompare(b.prefixo);
}

export const postosRepository: PostosRepository = {
  async buscarPorPrefixo(prefixo) {
    const achado = POSTOS_FIXTURES.find((p) => p.prefixo === prefixo);
    return achado ?? null;
  },

  async pesquisar(params: ParametrosPesquisa): Promise<ResultadoPesquisa> {
    const offset = (params.pagina - 1) * params.porPagina;
    let filtrados: Posto[] = [];

    if (params.prefixoComecaCom) {
      const padrao = params.prefixoComecaCom.toUpperCase();
      filtrados = POSTOS_FIXTURES.filter((p) =>
        p.prefixo.toUpperCase().startsWith(padrao),
      );
    } else if (params.termo) {
      const termos = params.termo
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map(normalizar);
      filtrados = POSTOS_FIXTURES.filter((p) =>
        termos.every((t) => combinaTermo(p, t)),
      );
    } else {
      return { total: 0, itens: [] };
    }

    filtrados.sort(ordenarPorPrefixo);
    const pagina = filtrados.slice(offset, offset + params.porPagina);

    return {
      total: filtrados.length,
      itens: pagina,
    };
  },
};
