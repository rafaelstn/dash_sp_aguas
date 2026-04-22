import type {
  ArquivoDesconforme,
  ContagensDesconformidade,
  DesconformidadePrefixo,
  DesconformidadePrefixoAna,
} from '@/domain/desconformidade';

export interface DesconformidadesRepository {
  listarPrefixosPrincipaisDesconformes(): Promise<DesconformidadePrefixo[]>;
  listarPrefixosAnaDesconformes(): Promise<DesconformidadePrefixoAna[]>;
  listarArquivosOrfaos(): Promise<ArquivoDesconforme[]>;
  listarArquivosMalformados(): Promise<ArquivoDesconforme[]>;
  contar(): Promise<ContagensDesconformidade>;
}
