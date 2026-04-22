import type { CodigoTipoDado } from './tipo-dado';
import type { CodigoTipoDocumento } from './tipo-documento';

/**
 * Formato do nome de arquivo detectado pelo indexer (v1.3).
 *   COMPLETO — padrão oficial: Prefixo CodDoc CodEnc [opcional] AAAA MM DD.pdf
 *   PARCIAL  — sem CodEnc:     Prefixo CodDoc AAAA MM DD.pdf
 *   LEGADO   — só prefixo:     Prefixo AAAA MM DD.pdf
 *
 * PARCIAL e LEGADO são conformes — não são listados em desconformidades.
 */
export type FormatoNomeArquivo = 'COMPLETO' | 'PARCIAL' | 'LEGADO';

/**
 * Arquivo indexado com metadados derivados do parsing do nome (v1.3 — 22/04/2026).
 * Os campos derivados (tipoDado, codTipoDocumento, codEncarregado, dataDocumento,
 * parteOpcional) são preenchidos pelo worker quando o nome adere a um dos 3
 * formatos aceitos. Campos ausentes em formatos mais curtos ficam nulos:
 *   - LEGADO  => codTipoDocumento = null, codEncarregado = null
 *   - PARCIAL => codEncarregado = null
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

  // v1.3 — formato do nome detectado pelo indexer
  formatoNome: FormatoNomeArquivo;
}
