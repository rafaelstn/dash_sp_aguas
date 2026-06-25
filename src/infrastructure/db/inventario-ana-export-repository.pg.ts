import 'server-only';
import { sql } from './client';
import { FalhaRepositorio } from '@/domain/errors';
import type {
  InventarioAnaExportRepository,
  LinhaInventarioAnaExport,
  MunicipioIbge,
} from '@/application/ports/inventario-ana-export-repository';

/**
 * Implementação PostgreSQL do port de leitura do export ANA. Concentra as duas
 * consultas que o use case `exportarInventarioAna` antes fazia direto via `sql`
 * (violando o DIP): o mapa de municípios IBGE e o JOIN das três fontes.
 */
export const inventarioAnaExportRepository: InventarioAnaExportRepository = {
  async carregarMunicipiosIbge(): Promise<MunicipioIbge[]> {
    try {
      return await sql<MunicipioIbge[]>`
        SELECT codigo_ibge, nome FROM ibge_municipios_sp
      `;
    } catch (e) {
      throw new FalhaRepositorio('inventarioAnaExport.carregarMunicipiosIbge', e);
    }
  },

  async carregarLinhasInventario(
    loteId: string,
  ): Promise<LinhaInventarioAnaExport[]> {
    try {
      return await sql<LinhaInventarioAnaExport[]>`
        SELECT
          e.codigo_ana             AS ana_codigo,
          e.codigo_adicional       AS ana_codigo_adicional,
          e.nome                   AS ana_nome,
          e.latitude::text         AS ana_latitude,
          e.longitude::text        AS ana_longitude,
          e.altitude::text         AS ana_altitude,
          e.area_drenagem_km2::text AS ana_area_drenagem_km2,
          e.bacia_codigo           AS ana_bacia_codigo,
          e.bacia_nome             AS ana_bacia_nome,
          e.subbacia_codigo        AS ana_subbacia_codigo,
          e.subbacia_nome          AS ana_subbacia_nome,
          e.rio_codigo             AS ana_rio_codigo,
          e.rio_nome               AS ana_rio_nome,
          e.estado_sigla           AS ana_estado_sigla,
          e.municipio_codigo       AS ana_municipio_codigo,
          e.municipio_nome         AS ana_municipio_nome,
          e.responsavel_sigla      AS ana_responsavel_sigla,
          e.estacao_tipo           AS ana_estacao_tipo,
          e.escala_inicio          AS ana_escala_inicio,
          e.escala_fim             AS ana_escala_fim,
          e.descarga_liquida_inicio AS ana_descarga_liquida_inicio,
          e.descarga_liquida_fim   AS ana_descarga_liquida_fim,
          e.sedimentos_inicio      AS ana_sedimentos_inicio,
          e.sedimentos_fim         AS ana_sedimentos_fim,
          e.qualidade_inicio       AS ana_qualidade_inicio,
          e.qualidade_fim          AS ana_qualidade_fim,
          e.pluviometro_inicio     AS ana_pluviometro_inicio,
          e.pluviometro_fim        AS ana_pluviometro_fim,
          e.telemetria_inicio      AS ana_telemetria_inicio,
          e.telemetria_fim         AS ana_telemetria_fim,
          e.operando               AS ana_operando,
          e.observacao_1           AS ana_observacao_1,
          e.observacao_2           AS ana_observacao_2,
          e.observacao_3           AS ana_observacao_3,
          e.observacao_4           AS ana_observacao_4,
          e.observacao_5           AS ana_observacao_5,
          e.status                 AS ana_status,
          e.resposta_municipio_codigo AS r_municipio_codigo,
          e.resposta_municipio_nome   AS r_municipio_nome,
          e.resposta_latitude::text   AS r_latitude,
          e.resposta_longitude::text  AS r_longitude,
          e.resposta_justificativa    AS r_justificativa,
          e.resposta_fonte            AS r_fonte,
          p.prefixo                AS p_prefixo,
          p.prefixo_ana            AS p_prefixo_ana,
          p.nome_estacao           AS p_nome_estacao,
          p.latitude::text         AS p_latitude,
          p.longitude::text        AS p_longitude,
          p.altimetria::text       AS p_altimetria,
          p.area_km2::text         AS p_area_km2,
          p.bacia_hidrografica     AS p_bacia_hidrografica,
          p.sub_ugrhi_nome         AS p_sub_ugrhi_nome,
          p.municipio              AS p_municipio,
          p.tipo_posto             AS p_tipo_posto,
          p.ana_escala_inicio      AS p_ana_escala_inicio,
          p.ana_escala_fim         AS p_ana_escala_fim,
          p.ana_descarga_liquida_inicio AS p_ana_descarga_liquida_inicio,
          p.ana_descarga_liquida_fim    AS p_ana_descarga_liquida_fim,
          p.ana_sedimentos_inicio  AS p_ana_sedimentos_inicio,
          p.ana_sedimentos_fim     AS p_ana_sedimentos_fim,
          p.ana_qualidade_inicio   AS p_ana_qualidade_inicio,
          p.ana_qualidade_fim      AS p_ana_qualidade_fim,
          p.ana_pluviometro_inicio AS p_ana_pluviometro_inicio,
          p.ana_pluviometro_fim    AS p_ana_pluviometro_fim,
          p.ana_telemetria_inicio  AS p_ana_telemetria_inicio,
          p.ana_telemetria_fim     AS p_ana_telemetria_fim
        FROM ana_revisao_estacao e
        LEFT JOIN postos p ON p.id = e.posto_id AND p.deleted_at IS NULL
        WHERE e.lote_id = ${loteId}
        ORDER BY e.codigo_ana
      `;
    } catch (e) {
      throw new FalhaRepositorio(
        'inventarioAnaExport.carregarLinhasInventario',
        e,
      );
    }
  },
};
