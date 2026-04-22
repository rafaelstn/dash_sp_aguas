import type { ArquivoIndexado } from '@/domain/arquivo-indexado';
import type { CodigoTipoDocumento } from '@/domain/tipo-documento';

export interface GrupoArquivosPorTipo {
  codTipoDocumento: CodigoTipoDocumento | null;
  rotulo: string;
  arquivos: ArquivoIndexado[];
}

export interface ArquivosRepository {
  listarPorPrefixo(prefixo: string): Promise<ArquivoIndexado[]>;
  foiIndexadoAlgumaVez(prefixo: string): Promise<boolean>;
  listarAgrupadosPorTipo(prefixo: string): Promise<GrupoArquivosPorTipo[]>;
}
