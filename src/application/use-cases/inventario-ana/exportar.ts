import 'server-only';
import ExcelJS from 'exceljs';
import { FalhaRepositorio } from '@/domain/errors';
import type { InventarioAnaExportRepository } from '@/application/ports/inventario-ana-export-repository';
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
  repo: InventarioAnaExportRepository,
  loteId: string,
): Promise<{ buffer: Buffer; nomeArquivo: string; estatisticas: { total: number; comDiff: number } }> {
  try {
    // Carrega o mapa nome (normalizado) → codigo_ibge uma única vez,
    // pra resolver `municipio_codigo` quando o nome efetivo veio de
    // `postos`. Sem este lookup, o XLSX pode sair com nome de um
    // município e código IBGE de outro (Q08 da auditoria 2026-05-18).
    const municipios = await repo.carregarMunicipiosIbge();
    const mapaCodigoIbge = new Map<string, string>();
    for (const m of municipios) {
      mapaCodigoIbge.set(chaveNomeMunicipio(m.nome), m.codigo_ibge);
    }

    const linhas = await repo.carregarLinhasInventario(loteId);

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
