/**
 * Value objects de desconformidade apresentados nas 4 abas da US-009.
 * Nenhuma alteração cadastral ocorre pela aplicação no MVP (ADR-0003).
 */

import type { CodigoTipoDado } from './tipo-dado';

export type CategoriaDesconformidade =
  | 'PREFIXO_PRINCIPAL'
  | 'PREFIXO_ANA'
  | 'ARQUIVO_ORFAO'
  | 'ARQUIVO_MALFORMADO';

export type ClassePrefixo =
  | 'suspeita_troca_letra_digito'
  | 'placeholder_interrogacao'
  | 'outlier_prefixo';

export type ClassePrefixoAna = 'faltando_zero_esquerda' | 'outlier_ana';

export type CategoriaArquivoOrfao = 'PREFIXO_DESCONHECIDO' | 'NOME_FORA_DO_PADRAO' | 'EXTENSAO_NAO_PDF';

export interface DesconformidadePrefixo {
  id: string;
  prefixo: string;
  classe: ClassePrefixo;
  sugestao: string | null;
  statusRevisao: 'pendente' | 'revisado';
}

export interface DesconformidadePrefixoAna {
  id: string;
  prefixo: string;
  prefixoAnaAtual: string | null;
  prefixoAnaSugerido: string | null;
  classe: ClassePrefixoAna;
  sugestao: string | null;
  statusRevisao: 'pendente' | 'revisado';
}

export interface ArquivoDesconforme {
  id: string;
  nomeArquivo: string;
  caminhoAbsoluto: string;
  tamanhoBytes: number;
  dataModificacao: Date;
  categoria: CategoriaArquivoOrfao;
  tipoDado: CodigoTipoDado | null;
  statusRevisao: 'pendente' | 'revisado';
}

export interface ContagensDesconformidade {
  prefixoPrincipal: number;
  prefixoAna: number;
  arquivosOrfaos: number;
  arquivosMalformados: number;
}
