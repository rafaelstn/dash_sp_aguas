import type { Posto } from '@/domain/posto';
import type { ArquivoIndexado } from '@/domain/arquivo-indexado';

/** Resposta paginada de /api/postos/search */
export interface RespostaBusca {
  total: number;
  pagina: number;
  porPagina: number;
  itens: Posto[];
}

/** Resposta de /api/postos/:prefixo */
export type RespostaFicha = Posto;

/** Resposta de /api/postos/:prefixo/arquivos */
export interface RespostaArquivos {
  prefixoJaIndexado: boolean;
  arquivos: ArquivoIndexado[];
}

/** Formato padrão de erro em API Route */
export interface RespostaErro {
  erro: {
    codigo: string;
    mensagem: string;
  };
}
