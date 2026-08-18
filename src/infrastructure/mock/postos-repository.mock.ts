import 'server-only';

import type {
  ParametrosPesquisa,
  PostoSugestao,
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

  async mapaIdsPorPrefixo() {
    const mapa = new Map<string, string>();
    for (const p of POSTOS_FIXTURES) mapa.set(p.prefixo, p.id);
    return mapa;
  },

  // Mutações não suportadas em modo demo (fixtures são read-only)
  async atualizar() {
    throw new Error('Modo demo: edição de posto indisponível sem banco.');
  },
  async criar() {
    throw new Error('Modo demo: criação de posto indisponível sem banco.');
  },
  async remover() {
    throw new Error('Modo demo: remoção de posto indisponível sem banco.');
  },
  async restaurar() {
    throw new Error('Modo demo: restauração de posto indisponível sem banco.');
  },

  async listarEventos() {
    // Modo demo nao tem audit trail real; retorna lista vazia em vez de
    // jogar erro, pra nao quebrar a tela de edicao.
    return [];
  },

  async autocompletar(termo: string, limite: number): Promise<PostoSugestao[]> {
    const t = termo.trim();
    if (t.length < 2) return [];
    const tNorm = normalizar(t);
    const prefixoNorm = t.toUpperCase();
    const sugestoes = POSTOS_FIXTURES.filter((p) => {
      const casaPrefixo = p.prefixo.toUpperCase().startsWith(prefixoNorm);
      const casaAna =
        typeof p.prefixoAna === 'string' &&
        p.prefixoAna.toUpperCase().startsWith(prefixoNorm);
      const casaNome =
        typeof p.nomeEstacao === 'string' &&
        normalizar(p.nomeEstacao).includes(tNorm);
      return casaPrefixo || casaAna || casaNome;
    });
    sugestoes.sort(ordenarPorPrefixo);
    return sugestoes.slice(0, limite).map((p) => ({
      prefixo: p.prefixo,
      nome: p.nomeEstacao,
      tipoPosto: p.tipoPosto,
      prefixoAna: p.prefixoAna,
    }));
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
