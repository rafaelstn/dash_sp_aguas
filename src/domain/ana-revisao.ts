/**
 * Tipos de domínio do módulo Inventário ANA (Meta I.6 do PROGESTÃO).
 *
 * O ciclo é: ANA manda planilha de dúvidas → SPÁguas revisa cada estação
 * (aceita sugestão automática, corrige manualmente ou justifica) → exporta
 * planilha de volta com as células alteradas em amarelo. Ver ADR-0011.
 */

export type StatusRevisao =
  | 'pendente'
  | 'em_revisao'
  | 'revisada'
  | 'descartada'
  | 'sem_match'
  | 'promovida_a_posto';

export type MatchTipo =
  | 'codigo_ana'
  | 'codigo_adicional'
  | 'manual'
  | 'sem_match';

export type DivergenciaMunicipio =
  | 'ok'
  | 'margem_aceitavel'
  | 'divergente'
  | 'sem_coordenada';

export interface AnaRevisaoLote {
  id: string;
  nome: string;
  arquivoOrigem: string | null;
  totalEstacoes: number;
  totalPendencias: number;
  prazoResposta: Date | null;
  criadoEm: Date;
}

export interface AnaRevisaoEstacao {
  id: string;
  loteId: string;

  codigoAna: string;
  codigoAdicional: string | null;
  nome: string | null;

  latitude: number | null;
  longitude: number | null;
  altitude: number | null;
  areaDrenagemKm2: number | null;

  baciaCodigo: string | null;
  baciaNome: string | null;
  subbaciaCodigo: string | null;
  subbaciaNome: string | null;
  rioCodigo: string | null;
  rioNome: string | null;

  estadoSigla: string | null;
  municipioCodigo: string | null;
  municipioNome: string | null;
  responsavelSigla: string | null;

  estacaoTipo: string | null;

  /** Pares início/fim por tipo de medição. ISO date string. */
  escalaInicio: string | null;
  escalaFim: string | null;
  descargaLiquidaInicio: string | null;
  descargaLiquidaFim: string | null;
  sedimentosInicio: string | null;
  sedimentosFim: string | null;
  qualidadeInicio: string | null;
  qualidadeFim: string | null;
  pluviometroInicio: string | null;
  pluviometroFim: string | null;
  telemetriaInicio: string | null;
  telemetriaFim: string | null;

  operando: boolean | null;

  /** Até 5 textos de observação vindos da planilha ANA. */
  observacoes: string[];

  /** Cruzamento com base interna. */
  postoId: string | null;
  postoPrefixo: string | null;
  matchTipo: MatchTipo | null;

  /** Estado de revisão. */
  status: StatusRevisao;

  /** Análise geográfica original (PostGIS, calculada no import sobre a coord ANA). */
  dentroMunicipioDeclarado: boolean | null;
  distanciaMunicipioDeclaradoM: number | null;
  municipioSugeridoCodigo: string | null;
  municipioSugeridoNome: string | null;
  divergenciaMunicipio: DivergenciaMunicipio | null;

  /**
   * Estado EFETIVO após correção (postos > resposta_* > snapshot ANA).
   * Usado na listagem operacional. Os campos brutos acima são preservados
   * para a planilha de devolução à ANA (precisa mostrar o problema original).
   */
  municipioEfetivo: string | null;
  divergenciaEfetiva: DivergenciaMunicipio | null;
  distanciaEfetivaM: number | null;
  /** Origem da correção quando aplicada ('banco_spaguas' | 'postgis_ibge' | 'manual_aprovador' | 'sem_correcao'). */
  respostaFonte: string | null;

  revisadoEm: Date | null;
  atualizadoEm: Date;
}

export interface FiltrosListaAnaRevisao {
  cenario?: string; // a partir do prefixo de OBSERVAÇÃO 1 (k, l, n etc)
  operando?: 'sim' | 'nao' | 'todos';
  status?: StatusRevisao;
  divergenciaMunicipio?: DivergenciaMunicipio;
  semMatch?: boolean;
  busca?: string; // codigo_ana, codigo_adicional ou nome
  pagina?: number;
  porPagina?: number;
}

export interface ResumoPainelAna {
  loteId: string;
  loteNome: string;
  prazoResposta: Date | null;
  totalEstacoes: number;
  totalPendencias: number;
  operando: number;
  desativadas: number;
  semMatch: number;
  statusPendente: number;
  statusEmRevisao: number;
  statusRevisada: number;
  statusDescartada: number;
  statusPromovida: number;
  divergenciaOk: number;
  divergenciaMargem: number;
  divergenciaDivergente: number;
  divergenciaSemCoord: number;
}

export interface ListaAnaRevisao {
  itens: AnaRevisaoEstacao[];
  total: number;
}

export interface AcaoBulkAna {
  estacaoIds: string[];
  acao:
    | 'marcar_revisada'
    | 'descartar'
    | 'aceitar_sugestao_municipio'
    | 'restaurar';
  justificativa?: string;
}

export interface ContextoAtor {
  usuarioId: string;
  ip: string | null;
  userAgent: string | null;
}
