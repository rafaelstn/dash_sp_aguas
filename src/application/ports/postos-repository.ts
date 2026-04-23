import type { Posto } from '@/domain/posto';

/**
 * Parâmetros de busca composta (ADR-0005 / filtros combinados).
 * Todos opcionais; podem ser combinados com AND. `termo` e `prefixoComecaCom`
 * são mutuamente exclusivos na origem (ver `buscarPostos` use case).
 */
export interface ParametrosPesquisa {
  termo?: string;
  prefixoComecaCom?: string;

  // Filtros categóricos (valores vêm de /api/postos/facetas)
  ugrhiNumero?: string;
  municipio?: string;
  baciaHidrografica?: string;
  tipoPosto?: string;

  // Checkbox de presença no cadastro
  temFichaDescritiva?: boolean;
  temFichaInspecao?: boolean;
  temTelemetrico?: boolean;

  // Apenas favoritos do usuário autenticado; exige usuarioId
  apenasFavoritos?: boolean;
  usuarioId?: string | null;

  pagina: number;
  porPagina: number;
}

export interface ResultadoPesquisa {
  total: number;
  itens: Posto[];
}

export interface PostosRepository {
  buscarPorPrefixo(prefixo: string): Promise<Posto | null>;
  pesquisar(params: ParametrosPesquisa): Promise<ResultadoPesquisa>;
}
