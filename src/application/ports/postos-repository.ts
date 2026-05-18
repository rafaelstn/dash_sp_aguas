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
  /**
   * Mantenedor — match exato em mantenedor OU btl. Os dois campos do schema
   * representam "responsável pelo posto" na visão do usuário (Polícia
   * Ambiental costuma estar em btl, DAEE/CETESB em mantenedor).
   */
  mantenedor?: string;
  /**
   * Status operacional — heurística de recência sobre `operacao_fim_ano`.
   * A coluna não significa só "ano em que parou": pra postos ativos a
   * planilha-fonte preenche com o ano da última varredura (ex: 2025),
   * pra extintos com o ano real de baixa, e usa 0 como sentinela.
   *
   *   'ativo'      → fim_ano IS NULL OR fim_ano >= ano_corrente - 1
   *   'desativado' → fim_ano > 0 AND fim_ano < ano_corrente - 1
   *   undefined    → qualquer
   *
   * Regra a confirmar com o cliente SPÁguas. Implementação dinâmica via
   * `EXTRACT(YEAR FROM CURRENT_DATE)` pra não envelhecer.
   */
  status?: 'ativo' | 'desativado';
  /**
   * Filtro geográfico por proximidade (sem PostGIS — bounding box em graus).
   * Tolerância fixa de ±0.01° (~1 km em SP). Os dois precisam estar
   * preenchidos pra surtir efeito; senão ambos são ignorados.
   */
  latitude?: number;
  longitude?: number;

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

/**
 * Campos editáveis de um posto. NÃO inclui `id`, `prefixo`, `createdAt`,
 * `updatedAt`, `deletedAt`, `origem` (são imutáveis pela UI ou gerenciados
 * pelo próprio repo).
 *
 * Todos opcionais: omitir campo = preservar o valor atual no banco.
 */
export type CamposEditaveisPosto = Partial<{
  mantenedor: string | null;
  prefixoAna: string | null;
  nomeEstacao: string | null;
  operacaoInicioAno: number | null;
  operacaoFimAno: number | null;
  latitude: number | null;
  longitude: number | null;
  municipio: string | null;
  municipioAlt: string | null;
  baciaHidrografica: string | null;
  ugrhiNome: string | null;
  ugrhiNumero: string | null;
  subUgrhiNome: string | null;
  subUgrhiNumero: string | null;
  rede: string | null;
  proprietario: string | null;
  tipoPosto: string | null;
  areaKm2: number | null;
  btl: string | null;
  ciaAmbiental: string | null;
  cobacia: string | null;
  observacoes: string | null;
  tempoTransmissao: string | null;
  statusPcd: string | null;
  ultimaTransmissao: string | null;
  convencional: string | null;
  loggerEqp: string | null;
  telemetrico: string | null;
  nivel: string | null;
  vazao: string | null;
  fichaInspecao: string | null;
  ultimaDataFi: string | null;
  fichaDescritiva: string | null;
  ultimaAtualizacaoFd: string | null;
  aquifero: string | null;
  altimetria: number | null;
  anaEscalaInicio: string | null;
  anaEscalaFim: string | null;
  anaDescargaLiquidaInicio: string | null;
  anaDescargaLiquidaFim: string | null;
  anaSedimentosInicio: string | null;
  anaSedimentosFim: string | null;
  anaQualidadeInicio: string | null;
  anaQualidadeFim: string | null;
  anaPluviometroInicio: string | null;
  anaPluviometroFim: string | null;
  anaTelemetriaInicio: string | null;
  anaTelemetriaFim: string | null;
}>;

/**
 * Campos exigidos na criação de um posto novo. `prefixo` é obrigatório
 * porque é a chave natural. Os demais são opcionais (mesmo regime de
 * `CamposEditaveisPosto`).
 */
export type DadosCriacaoPosto = CamposEditaveisPosto & {
  prefixo: string;
  origem?: string;
};

export interface ContextoAtorPosto {
  usuarioId: string;
  ip: string | null;
  userAgent: string | null;
  /** Origem semântica do evento (ui_edicao | ana_promocao_manual | ana_promocao_bulk | etc). */
  origemEvento?: string;
  /** ID de origem externa (ex: ana_revisao_estacao.id). */
  referenciaExternaId?: string | null;
  /** Observação livre pro audit. */
  observacao?: string | null;
}

export interface PostosRepository {
  buscarPorPrefixo(prefixo: string): Promise<Posto | null>;
  pesquisar(params: ParametrosPesquisa): Promise<ResultadoPesquisa>;

  /**
   * Atualiza campos de um posto. Audita em `postos_evento`. Falha se
   * o posto está soft-deleted (`deleted_at IS NOT NULL`) — restaura
   * antes de editar.
   */
  atualizar(
    prefixo: string,
    campos: CamposEditaveisPosto,
    ator: ContextoAtorPosto,
  ): Promise<Posto>;

  /** Cria posto novo. Falha se o `prefixo` já existe. */
  criar(dados: DadosCriacaoPosto, ator: ContextoAtorPosto): Promise<Posto>;

  /** Soft delete (marca `deleted_at = NOW()`). Não remove a linha. */
  remover(prefixo: string, ator: ContextoAtorPosto): Promise<void>;

  /** Reverte soft delete (`deleted_at = NULL`). */
  restaurar(prefixo: string, ator: ContextoAtorPosto): Promise<Posto>;

  /** Histórico de eventos auditados do posto (LGPD §4). Limitado ao `limite`. */
  listarEventos(postoId: string, limite?: number): Promise<EventoPosto[]>;
}

/**
 * Linha do audit trail (`postos_evento`). Mantida no port pra evitar que
 * UI/use cases dependam do schema cru do banco.
 */
export interface EventoPosto {
  id: string;
  evento: string;
  atorEmail: string | null;
  origemEvento: string | null;
  observacao: string | null;
  valoresAntes: unknown;
  valoresDepois: unknown;
  ocorreuEm: Date;
}
