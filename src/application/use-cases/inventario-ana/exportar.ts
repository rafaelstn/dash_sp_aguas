import 'server-only';
import ExcelJS from 'exceljs';
import { sql } from '@/infrastructure/db/client';
import { FalhaRepositorio } from '@/domain/errors';
import schemaColunasAna from '../../../../data/colunas-ana.json';

/**
 * Schema único das colunas ANA, compartilhado com o patcher Python
 * (scripts/manutencao/aplicar_resposta_na_planilha_sharepoint.py). Editar
 * data/colunas-ana.json muda os dois lados. Aqui usamos `colExcel`, `chave`
 * e o flag `diff` para montar o mapa de diferenças sem repetir os índices.
 */
interface ColunaAnaSchema {
  colExcel: number;
  chave: string;
  label: string;
  tipo: 'texto' | 'numero' | 'data';
  aliasPy: string;
  fonteFallback: string[];
  diff: boolean;
}
const COLUNAS_DIFF: ColunaAnaSchema[] = (
  schemaColunasAna.colunas as ColunaAnaSchema[]
).filter((c) => c.diff);

/**
 * Exportador do inventário ANA.
 *
 * Ordem de prioridade (mais autoritativa primeiro):
 *   1. postos (fonte da verdade quando há match)
 *   2. ana_revisao_estacao.resposta_* (correção SPÁguas para estações sem
 *      match, ex.: centroide IBGE para coord ANA truncada)
 *   3. ana_revisao_estacao (snapshot ANA original, read-only)
 *
 * Para cada coluna, o valor final é `posto ?? resposta ?? snapshot`. Onde
 * o valor final difere do snapshot ANA, a célula é pintada em AMARELO.
 *
 * Saída: XLSX com cabeçalho idêntico à aba DÚVIDAS + 2 colunas controle
 * (STATUS_REVISAO_SPAGUAS, JUSTIFICATIVA_SPAGUAS).
 */

interface LinhaJoin {
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

function valOuFallback<T>(valPosto: T | null, valAna: T | null): T | null {
  // Quando o posto existe e tem o campo preenchido, ele manda (é a verdade).
  // Senão, mantém o que a ANA disse no snapshot.
  return valPosto ?? valAna;
}

function valOuFallback3<T>(
  valPosto: T | null,
  valResposta: T | null,
  valAna: T | null,
): T | null {
  // postos (autoritativo) > resposta SPÁguas (correção sem-match) > snapshot ANA.
  return valPosto ?? valResposta ?? valAna;
}

function dataISO(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

function diferentes(atual: unknown, snapshot: unknown): boolean {
  // Normaliza tipos para comparar (número string vs número, datas, etc).
  if (atual === null && snapshot === null) return false;
  if (atual === null || snapshot === null) return true;
  return String(atual).trim() !== String(snapshot).trim();
}

const PREENCHIMENTO_AMARELO: ExcelJS.FillPattern = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFFFF00' },
};

const PREENCHIMENTO_CINZA: ExcelJS.FillPattern = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFE0E0E0' },
};

/**
 * Normaliza nome de município para lookup case e acento insensitivo:
 * minúsculas + remove diacríticos. Usado para resolver `codigo_ibge`
 * a partir do nome quando o município efetivo veio de `postos`.
 */
function chaveNomeMunicipio(nome: string): string {
  return nome
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

export async function exportarInventarioAna(
  loteId: string,
): Promise<{ buffer: Buffer; nomeArquivo: string; estatisticas: { total: number; comDiff: number } }> {
  try {
    // Carrega o mapa nome (normalizado) → codigo_ibge uma única vez,
    // pra resolver `municipio_codigo` quando o nome efetivo veio de
    // `postos`. Sem este lookup, o XLSX pode sair com nome de um
    // município e código IBGE de outro (Q08 da auditoria 2026-05-18).
    const municipios = await sql<{ codigo_ibge: string; nome: string }[]>`
      SELECT codigo_ibge, nome FROM ibge_municipios_sp
    `;
    const mapaCodigoIbge = new Map<string, string>();
    for (const m of municipios) {
      mapaCodigoIbge.set(chaveNomeMunicipio(m.nome), m.codigo_ibge);
    }

    const linhas = await sql<LinhaJoin[]>`
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

    const wb = new ExcelJS.Workbook();
    wb.creator = 'SPAguas Ficha Tecnica';
    wb.created = new Date();
    const ws = wb.addWorksheet('DÚVIDAS', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });

    const cabecalhos = [
      'Responsável - UF', 'Estação - Código', 'Estação - Nome',
      'Estação - Código Adicional', 'Latitude_Dec', 'Longitude_Dec',
      'Latitude_Graus', 'Longitude_Graus', 'Altitude',
      'Estação - Área de Drenagem (km²)', 'BaciaCodigo', 'Bacia - Nome',
      'SubBaciaCodigo', 'SubBacia - Nome', 'RioCodigo', 'RioNome',
      'EstadoCodigo', 'Estado - Sigla', 'MunicipioCodigo', 'Município - Nome',
      'ResponsavelCodigo', 'Responsável - Nome', 'Responsável - Sigla',
      'Estação - Tipo',
      'Escala - Início', 'Escala - Fim',
      'Descarga Líquida - Início', 'Descarga Líquida - Fim',
      'Sedimentos - Início', 'Sedimentos - Fim',
      'Qualidade de Água - Início', 'Qualidade de Água - Fim',
      'Pluviômetro - Início', 'Pluviômetro - Fim',
      'Telemetria - Início', 'Telemetria - Fim',
      'Operando',
      'OBSERVAÇÃO 1', 'OBSERVAÇÃO 2', 'OBSERVAÇÃO 3', 'OBSERVAÇÃO 4', 'OBSERVAÇÃO 5',
      'STATUS_REVISAO_SPAGUAS', 'JUSTIFICATIVA_SPAGUAS',
    ];
    ws.addRow(cabecalhos);
    const header = ws.getRow(1);
    header.font = { bold: true };
    header.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
    header.height = 30;
    header.eachCell((c) => {
      c.fill = PREENCHIMENTO_CINZA;
      c.border = {
        top: { style: 'thin', color: { argb: 'FF808080' } },
        left: { style: 'thin', color: { argb: 'FF808080' } },
        bottom: { style: 'thin', color: { argb: 'FF808080' } },
        right: { style: 'thin', color: { argb: 'FF808080' } },
      };
    });

    let totalComDiff = 0;

    for (const linha of linhas) {
      // postos > resposta SPÁguas > snapshot ANA
      const finalNome = valOuFallback(linha.p_nome_estacao, linha.ana_nome);
      const finalCodigoAdicional = valOuFallback(linha.p_prefixo, linha.ana_codigo_adicional);
      const finalLat = valOuFallback3(linha.p_latitude, linha.r_latitude, linha.ana_latitude);
      const finalLng = valOuFallback3(linha.p_longitude, linha.r_longitude, linha.ana_longitude);
      const finalAltitude = valOuFallback(linha.p_altimetria, linha.ana_altitude);
      const finalArea = valOuFallback(linha.p_area_km2, linha.ana_area_drenagem_km2);
      const finalBacia = valOuFallback(linha.p_bacia_hidrografica, linha.ana_bacia_nome);
      const finalSubBacia = valOuFallback(linha.p_sub_ugrhi_nome, linha.ana_subbacia_nome);
      const finalMunicipio = valOuFallback3(linha.p_municipio, linha.r_municipio_nome, linha.ana_municipio_nome);
      // Q08: quando o nome veio de `postos`, o codigo precisa vir do IBGE
      // pelo nome efetivo, senao o XLSX pode sair com "Atibaia, cod SP".
      // Resolve via lookup no mapa carregado uma vez antes do loop.
      let finalMunicipioCodigo: string | null;
      if (linha.p_municipio && linha.p_municipio !== linha.ana_municipio_nome) {
        finalMunicipioCodigo =
          mapaCodigoIbge.get(chaveNomeMunicipio(linha.p_municipio)) ?? null;
      } else {
        finalMunicipioCodigo = valOuFallback(
          linha.r_municipio_codigo,
          linha.ana_municipio_codigo,
        );
      }
      const finalTipo = valOuFallback(linha.p_tipo_posto, linha.ana_estacao_tipo);
      const finalEscIni = dataISO(valOuFallback(linha.p_ana_escala_inicio, linha.ana_escala_inicio));
      const finalEscFim = dataISO(valOuFallback(linha.p_ana_escala_fim, linha.ana_escala_fim));
      const finalDLIni = dataISO(valOuFallback(linha.p_ana_descarga_liquida_inicio, linha.ana_descarga_liquida_inicio));
      const finalDLFim = dataISO(valOuFallback(linha.p_ana_descarga_liquida_fim, linha.ana_descarga_liquida_fim));
      const finalSedIni = dataISO(valOuFallback(linha.p_ana_sedimentos_inicio, linha.ana_sedimentos_inicio));
      const finalSedFim = dataISO(valOuFallback(linha.p_ana_sedimentos_fim, linha.ana_sedimentos_fim));
      const finalQualIni = dataISO(valOuFallback(linha.p_ana_qualidade_inicio, linha.ana_qualidade_inicio));
      const finalQualFim = dataISO(valOuFallback(linha.p_ana_qualidade_fim, linha.ana_qualidade_fim));
      const finalPluIni = dataISO(valOuFallback(linha.p_ana_pluviometro_inicio, linha.ana_pluviometro_inicio));
      const finalPluFim = dataISO(valOuFallback(linha.p_ana_pluviometro_fim, linha.ana_pluviometro_fim));
      const finalTelIni = dataISO(valOuFallback(linha.p_ana_telemetria_inicio, linha.ana_telemetria_inicio));
      const finalTelFim = dataISO(valOuFallback(linha.p_ana_telemetria_fim, linha.ana_telemetria_fim));
      const operandoTexto = linha.ana_operando === true ? 'Sim' : linha.ana_operando === false ? 'Não' : null;

      const values = [
        'SP', // Responsável UF (sistema é SP-only)
        linha.ana_codigo,
        finalNome,
        finalCodigoAdicional,
        finalLat,
        finalLng,
        null, // graus (não usado pelo sistema)
        null,
        finalAltitude,
        finalArea,
        linha.ana_bacia_codigo,
        finalBacia,
        linha.ana_subbacia_codigo,
        finalSubBacia,
        linha.ana_rio_codigo,
        linha.ana_rio_nome,
        null, // estado_codigo
        linha.ana_estado_sigla,
        finalMunicipioCodigo,
        finalMunicipio,
        null, null, // responsavel_codigo, responsavel_nome
        linha.ana_responsavel_sigla,
        finalTipo,
        finalEscIni, finalEscFim,
        finalDLIni, finalDLFim,
        finalSedIni, finalSedFim,
        finalQualIni, finalQualFim,
        finalPluIni, finalPluFim,
        finalTelIni, finalTelFim,
        operandoTexto,
        linha.ana_observacao_1, linha.ana_observacao_2, linha.ana_observacao_3,
        linha.ana_observacao_4, linha.ana_observacao_5,
        linha.ana_status,
        linha.r_justificativa,
      ];

      const row = ws.addRow(values);

      // Pinta amarelo onde o valor final difere do snapshot ANA
      // (indica: SPÁguas corrigiu este campo). As colunas e seus índices
      // Excel vêm do schema compartilhado; aqui só ligamos cada `chave` ao
      // par (valor final, snapshot ANA) calculado acima.
      const valoresPorChave: Record<string, { novo: unknown; antigo: unknown }> = {
        nome: { novo: finalNome, antigo: linha.ana_nome },
        codigoAdicional: { novo: finalCodigoAdicional, antigo: linha.ana_codigo_adicional },
        latitude: { novo: finalLat, antigo: linha.ana_latitude },
        longitude: { novo: finalLng, antigo: linha.ana_longitude },
        altitude: { novo: finalAltitude, antigo: linha.ana_altitude },
        areaDrenagem: { novo: finalArea, antigo: linha.ana_area_drenagem_km2 },
        baciaNome: { novo: finalBacia, antigo: linha.ana_bacia_nome },
        subbaciaNome: { novo: finalSubBacia, antigo: linha.ana_subbacia_nome },
        municipioCodigo: { novo: finalMunicipioCodigo, antigo: linha.ana_municipio_codigo },
        municipioNome: { novo: finalMunicipio, antigo: linha.ana_municipio_nome },
        estacaoTipo: { novo: finalTipo, antigo: linha.ana_estacao_tipo },
        escalaInicio: { novo: finalEscIni, antigo: dataISO(linha.ana_escala_inicio) },
        escalaFim: { novo: finalEscFim, antigo: dataISO(linha.ana_escala_fim) },
        descargaInicio: { novo: finalDLIni, antigo: dataISO(linha.ana_descarga_liquida_inicio) },
        descargaFim: { novo: finalDLFim, antigo: dataISO(linha.ana_descarga_liquida_fim) },
        sedimentosInicio: { novo: finalSedIni, antigo: dataISO(linha.ana_sedimentos_inicio) },
        sedimentosFim: { novo: finalSedFim, antigo: dataISO(linha.ana_sedimentos_fim) },
        qualidadeInicio: { novo: finalQualIni, antigo: dataISO(linha.ana_qualidade_inicio) },
        qualidadeFim: { novo: finalQualFim, antigo: dataISO(linha.ana_qualidade_fim) },
        pluviometroInicio: { novo: finalPluIni, antigo: dataISO(linha.ana_pluviometro_inicio) },
        pluviometroFim: { novo: finalPluFim, antigo: dataISO(linha.ana_pluviometro_fim) },
        telemetriaInicio: { novo: finalTelIni, antigo: dataISO(linha.ana_telemetria_inicio) },
        telemetriaFim: { novo: finalTelFim, antigo: dataISO(linha.ana_telemetria_fim) },
      };

      let temDiff = false;
      for (const coluna of COLUNAS_DIFF) {
        const par = valoresPorChave[coluna.chave];
        if (par && diferentes(par.novo, par.antigo)) {
          row.getCell(coluna.colExcel).fill = PREENCHIMENTO_AMARELO;
          temDiff = true;
        }
      }
      if (temDiff) totalComDiff += 1;
    }

    ws.columns.forEach((col) => {
      col.width = 18;
    });
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: cabecalhos.length },
    };

    const buf = await wb.xlsx.writeBuffer();
    const hoje = new Date().toISOString().slice(0, 10);
    return {
      buffer: Buffer.from(buf),
      nomeArquivo: `SP_AGUAS_Inventario_${hoje}.xlsx`,
      estatisticas: { total: linhas.length, comDiff: totalComDiff },
    };
  } catch (e) {
    throw new FalhaRepositorio('exportarInventarioAna', e);
  }
}
