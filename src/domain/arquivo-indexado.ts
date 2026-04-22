import type { CodigoTipoDado } from './tipo-dado';
import type { CodigoTipoDocumento } from './tipo-documento';

/**
 * Arquivo indexado com metadados derivados do parsing do nome (v1.2 — 22/04/2026).
 * Os campos derivados (tipoDado, codTipoDocumento, codEncarregado, dataDocumento,
 * parteOpcional) são preenchidos pelo worker quando o nome adere ao padrão oficial.
 * Arquivos pré-v1.2 podem ter derivados nulos — o frontend trata como
 * "Sem classificação" (US-010, GWT-010.3).
 */
export interface ArquivoIndexado {
  id: string;
  prefixo: string;
  nomeArquivo: string;
  caminhoAbsoluto: string;
  tamanhoBytes: number;
  dataModificacao: Date;
  hashConteudo: string | null;
  indexadoEm: Date;
  loteIndexacao: string;

  // derivados (v1.2)
  tipoDado: CodigoTipoDado | null;
  codTipoDocumento: CodigoTipoDocumento | null;
  codEncarregado: string | null;
  dataDocumento: Date | null;
  parteOpcional: string | null;
  nomeValido: boolean;
}
