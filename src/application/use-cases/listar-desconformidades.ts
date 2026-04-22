import type { DesconformidadesRepository } from '@/application/ports/desconformidades-repository';
import type {
  ArquivoDesconforme,
  CategoriaDesconformidade,
  ContagensDesconformidade,
  DesconformidadePrefixo,
  DesconformidadePrefixoAna,
} from '@/domain/desconformidade';

export type ResultadoPorCategoria =
  | { categoria: 'PREFIXO_PRINCIPAL'; itens: DesconformidadePrefixo[] }
  | { categoria: 'PREFIXO_ANA'; itens: DesconformidadePrefixoAna[] }
  | { categoria: 'ARQUIVO_ORFAO' | 'ARQUIVO_MALFORMADO'; itens: ArquivoDesconforme[] };

/**
 * Lista as desconformidades de uma categoria. O MVP não aplica correção
 * automática (ver ADR-0003); este caso de uso é estritamente leitura.
 */
export async function listarDesconformidades(
  repo: DesconformidadesRepository,
  categoria: CategoriaDesconformidade,
): Promise<ResultadoPorCategoria> {
  switch (categoria) {
    case 'PREFIXO_PRINCIPAL': {
      const itens = await repo.listarPrefixosPrincipaisDesconformes();
      return { categoria, itens };
    }
    case 'PREFIXO_ANA': {
      const itens = await repo.listarPrefixosAnaDesconformes();
      return { categoria, itens };
    }
    case 'ARQUIVO_ORFAO': {
      const itens = await repo.listarArquivosOrfaos();
      return { categoria, itens };
    }
    case 'ARQUIVO_MALFORMADO': {
      const itens = await repo.listarArquivosMalformados();
      return { categoria, itens };
    }
  }
}

export async function contarDesconformidades(
  repo: DesconformidadesRepository,
): Promise<ContagensDesconformidade> {
  return repo.contar();
}
