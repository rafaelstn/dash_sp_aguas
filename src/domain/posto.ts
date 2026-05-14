/**
 * Entidade Posto Hidrológico — espelho dos 37 campos da planilha oficial SPÁguas.
 *
 * Todos os campos (exceto `prefixo`) são opcionais por invariante do domínio
 * (ver docs/spec.md §3.3 INV-02). Campos originalmente datados na planilha vêm
 * como string por tolerância a formatos heterogêneos.
 */
export interface Posto {
  id: string;
  prefixo: string;
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

  // ──────────── Datas de medição ANA (Meta I.6 PROGESTÃO) ────────────
  // Adicionadas pela migration 0031. Espelham os 6 pares início/fim por
  // tipo de medição que a ANA exige no inventário oficial.
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

  // ──────────── Gestão de ciclo de vida ────────────
  /** Soft delete. NULL = ativo. */
  deletedAt: Date | null;
  /** Origem do cadastro (importacao_csv | ana_promocao_* | edicao_manual). */
  origem: string | null;

  createdAt: Date;
  updatedAt: Date;

  // ──────────── Metadados de indexação sob demanda ────────────
  // Populados pelo use-case obter-ficha a partir do repositório de indexação.
  // Permanecem opcionais para compatibilidade com fontes (mock/v1) que ainda
  // não preenchem esses campos.
  /** Momento da última indexação bem-sucedida do acervo do posto. */
  indexadoEm?: Date | null;
  /** Quando a entrada de cache expira (TTL 24h). */
  indexExpiraEm?: Date | null;
  /** Estado atual da indexação — usado pelo BadgeIndexacao. */
  statusIndexacao?: 'ok' | 'stale' | 'ausente' | 'indexando';
}
