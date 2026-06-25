/**
 * Port de leitura para o exportador do inventário ANA (use case
 * `exportarInventarioAna`). Isola o use case do acesso a dados concreto
 * (`sql`), permitindo mock em teste e respeitando o DIP.
 */

/** Município de SP com código IBGE, para resolver código a partir do nome. */
export interface MunicipioIbge {
  codigo_ibge: string;
  nome: string;
}

/**
 * Linha do JOIN do inventário ANA, com as três fontes lado a lado:
 * snapshot ANA (`ana_*`), resposta SPÁguas (`r_*`) e posto casado (`p_*`).
 * O use case aplica a precedência `posto ?? resposta ?? snapshot`.
 */
export interface LinhaInventarioAnaExport {
  // Snapshot ANA (read-only após import)
  ana_codigo: string;
  ana_codigo_adicional: string | null;
  ana_nome: string | null;
  ana_latitude: string | null;
  ana_longitude: string | null;
  ana_altitude: string | null;
  ana_area_drenagem_km2: string | null;
  ana_bacia_codigo: string | null;
  ana_bacia_nome: string | null;
  ana_subbacia_codigo: string | null;
  ana_subbacia_nome: string | null;
  ana_rio_codigo: string | null;
  ana_rio_nome: string | null;
  ana_estado_sigla: string | null;
  ana_municipio_codigo: string | null;
  ana_municipio_nome: string | null;
  ana_responsavel_sigla: string | null;
  ana_estacao_tipo: string | null;
  ana_escala_inicio: Date | null;
  ana_escala_fim: Date | null;
  ana_descarga_liquida_inicio: Date | null;
  ana_descarga_liquida_fim: Date | null;
  ana_sedimentos_inicio: Date | null;
  ana_sedimentos_fim: Date | null;
  ana_qualidade_inicio: Date | null;
  ana_qualidade_fim: Date | null;
  ana_pluviometro_inicio: Date | null;
  ana_pluviometro_fim: Date | null;
  ana_telemetria_inicio: Date | null;
  ana_telemetria_fim: Date | null;
  ana_operando: boolean | null;
  ana_observacao_1: string | null;
  ana_observacao_2: string | null;
  ana_observacao_3: string | null;
  ana_observacao_4: string | null;
  ana_observacao_5: string | null;
  ana_status: string;

  // resposta SPÁguas (preenchida quando há correção para estação sem match)
  r_municipio_codigo: string | null;
  r_municipio_nome: string | null;
  r_latitude: string | null;
  r_longitude: string | null;
  r_justificativa: string | null;
  r_fonte: string | null;

  // postos (fonte da verdade; null se não houver match)
  p_prefixo: string | null;
  p_prefixo_ana: string | null;
  p_nome_estacao: string | null;
  p_latitude: string | null;
  p_longitude: string | null;
  p_altimetria: string | null;
  p_area_km2: string | null;
  p_bacia_hidrografica: string | null;
  p_sub_ugrhi_nome: string | null;
  p_municipio: string | null;
  p_tipo_posto: string | null;
  p_ana_escala_inicio: Date | null;
  p_ana_escala_fim: Date | null;
  p_ana_descarga_liquida_inicio: Date | null;
  p_ana_descarga_liquida_fim: Date | null;
  p_ana_sedimentos_inicio: Date | null;
  p_ana_sedimentos_fim: Date | null;
  p_ana_qualidade_inicio: Date | null;
  p_ana_qualidade_fim: Date | null;
  p_ana_pluviometro_inicio: Date | null;
  p_ana_pluviometro_fim: Date | null;
  p_ana_telemetria_inicio: Date | null;
  p_ana_telemetria_fim: Date | null;
}

export interface InventarioAnaExportRepository {
  /** Mapa-fonte nome→código IBGE dos municípios de SP. */
  carregarMunicipiosIbge(): Promise<MunicipioIbge[]>;
  /** Linhas do lote, já com o JOIN das três fontes, ordenadas por código ANA. */
  carregarLinhasInventario(loteId: string): Promise<LinhaInventarioAnaExport[]>;
}
