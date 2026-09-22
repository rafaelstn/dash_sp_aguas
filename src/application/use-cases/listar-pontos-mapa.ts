import type {
  FiltroCadastroMapa,
  MapaPostosRepository,
} from '@/application/ports/mapa-postos-repository';
import { pareceCodigoDePosto } from '@/application/use-cases/buscar-postos';
import { TermoBuscaInvalido } from '@/domain/errors';
import {
  atendeFiltros,
  contarFacetas,
  type FacetasMapa,
  type FiltrosClassificacao,
  type PontoMapaPosto,
} from '@/domain/mapa-postos';

export interface EntradaListarPontosMapa extends FiltrosClassificacao {
  readonly termo?: string;
  readonly municipio?: string;
  readonly baciaHidrografica?: string;
  readonly mantenedor?: string;
  readonly apenasFavoritos?: boolean;
  readonly usuarioId?: string | null;
}

export interface ResultadoPontosMapa {
  /** Quantos pontos passaram em TODOS os filtros (é o tamanho de `pontos`). */
  readonly total: number;
  /** Quantos desses não têm coordenada válida e não podem ser desenhados. */
  readonly semCoordenada: number;
  readonly pontos: readonly PontoMapaPosto[];
  readonly facetas: FacetasMapa;
}

/**
 * Pontos do mapa da tela Postos, com as facetas em contagem cruzada.
 *
 * Diferente de `buscarPostos`, sem termo e sem filtro a resposta NÃO é vazia:
 * o mapa abre mostrando a base inteira. As regras de termo são as mesmas da
 * busca (um caractere é recusado, código de posto vira início de prefixo), para
 * a lista e o mapa não discordarem sobre o que o mesmo texto encontra.
 */
export async function listarPontosMapa(
  repo: MapaPostosRepository,
  entrada: EntradaListarPontosMapa,
): Promise<ResultadoPontosMapa> {
  const termo = (entrada.termo ?? '').trim();
  if (termo.length === 1) {
    throw new TermoBuscaInvalido('informe ao menos 2 caracteres');
  }
  const codigo = termo.length > 0 && pareceCodigoDePosto(termo);

  const filtroCadastro: FiltroCadastroMapa = {
    termo: termo.length > 0 && !codigo ? termo : undefined,
    prefixoComecaCom: codigo ? termo.toUpperCase() : undefined,
    municipio: entrada.municipio,
    baciaHidrografica: entrada.baciaHidrografica,
    mantenedor: entrada.mantenedor,
    apenasFavoritos: entrada.apenasFavoritos,
    usuarioId: entrada.usuarioId,
  };

  const classificacao: FiltrosClassificacao = {
    tipo: entrada.tipo,
    situacao: entrada.situacao,
    transmissao: entrada.transmissao,
    vazao: entrada.vazao,
    ugrhi: entrada.ugrhi,
    uf: entrada.uf,
  };

  const candidatos =
    entrada.apenasFavoritos && !entrada.usuarioId
      ? []
      : await repo.listarPontos(filtroCadastro);

  const pontos = candidatos.filter((p) => atendeFiltros(p, classificacao));
  return {
    total: pontos.length,
    semCoordenada: pontos.filter((p) => p.lat === null || p.lon === null).length,
    pontos,
    facetas: contarFacetas(candidatos, classificacao),
  };
}
