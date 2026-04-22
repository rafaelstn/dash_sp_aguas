import type { Posto } from '@/domain/posto';

export interface ParametrosPesquisa {
  termo?: string;
  prefixoComecaCom?: string;
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
