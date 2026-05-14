import 'server-only';
import ExcelJS from 'exceljs';
import type { AnaRevisaoRepository } from '@/application/ports/ana-revisao-repository';
import type { AnaRevisaoEstacao } from '@/domain/ana-revisao';

/**
 * Mapeamento entre o campo da estação (camelCase do domínio) e a coluna da
 * planilha ANA. Mantém a ordem exata da aba DÚVIDAS pra que SPÁguas consiga
 * colar no SharePoint da ANA preservando os índices de coluna.
 */
const COLUNAS: ReadonlyArray<{
  cabecalho: string;
  campo: keyof AnaRevisaoEstacao | null;
  formato?: 'data' | 'numero' | 'sim_nao';
  /** Campo na correcoes (camelCase) cuja presença marca a célula como alterada. */
  campoCorrecao?: string;
}> = [
  { cabecalho: 'Responsável - UF', campo: null }, // fixo "SP" abaixo
  { cabecalho: 'Estação - Código', campo: 'codigoAna' },
  { cabecalho: 'Estação - Nome', campo: 'nome', campoCorrecao: 'nome' },
  { cabecalho: 'Estação - Código Adicional', campo: 'codigoAdicional', campoCorrecao: 'codigoAdicional' },
  { cabecalho: 'Latitude_Dec', campo: 'latitude', formato: 'numero', campoCorrecao: 'latitude' },
  { cabecalho: 'Longitude_Dec', campo: 'longitude', formato: 'numero', campoCorrecao: 'longitude' },
  { cabecalho: 'Latitude_Graus', campo: null },
  { cabecalho: 'Longitude_Graus', campo: null },
  { cabecalho: 'Altitude', campo: 'altitude', formato: 'numero' },
  { cabecalho: 'Estação - Área de Drenagem (km²)', campo: 'areaDrenagemKm2', formato: 'numero' },
  { cabecalho: 'BaciaCodigo', campo: 'baciaCodigo' },
  { cabecalho: 'Bacia - Nome', campo: 'baciaNome' },
  { cabecalho: 'SubBaciaCodigo', campo: 'subbaciaCodigo' },
  { cabecalho: 'SubBacia - Nome', campo: 'subbaciaNome', campoCorrecao: 'subbaciaNome' },
  { cabecalho: 'RioCodigo', campo: 'rioCodigo' },
  { cabecalho: 'RioNome', campo: 'rioNome', campoCorrecao: 'rioNome' },
  { cabecalho: 'EstadoCodigo', campo: null },
  { cabecalho: 'Estado - Sigla', campo: 'estadoSigla' },
  { cabecalho: 'MunicipioCodigo', campo: 'municipioCodigo', campoCorrecao: 'municipioCodigo' },
  { cabecalho: 'Município - Nome', campo: 'municipioNome', campoCorrecao: 'municipioNome' },
  { cabecalho: 'ResponsavelCodigo', campo: null },
  { cabecalho: 'Responsável - Nome', campo: null },
  { cabecalho: 'Responsável - Sigla', campo: 'responsavelSigla' },
  { cabecalho: 'Estação - Tipo', campo: 'estacaoTipo' },
  { cabecalho: 'Escala - Início', campo: 'escalaInicio', formato: 'data' },
  { cabecalho: 'Escala - Fim', campo: 'escalaFim', formato: 'data', campoCorrecao: 'escalaFim' },
  { cabecalho: 'Descarga Líquida - Início', campo: 'descargaLiquidaInicio', formato: 'data' },
  { cabecalho: 'Descarga Líquida - Fim', campo: 'descargaLiquidaFim', formato: 'data', campoCorrecao: 'descargaLiquidaFim' },
  { cabecalho: 'Sedimentos - Início', campo: 'sedimentosInicio', formato: 'data' },
  { cabecalho: 'Sedimentos - Fim', campo: 'sedimentosFim', formato: 'data', campoCorrecao: 'sedimentosFim' },
  { cabecalho: 'Qualidade de Água - Início', campo: 'qualidadeInicio', formato: 'data' },
  { cabecalho: 'Qualidade de Água - Fim', campo: 'qualidadeFim', formato: 'data', campoCorrecao: 'qualidadeFim' },
  { cabecalho: 'Pluviômetro - Início', campo: 'pluviometroInicio', formato: 'data' },
  { cabecalho: 'Pluviômetro - Fim', campo: 'pluviometroFim', formato: 'data', campoCorrecao: 'pluviometroFim' },
  { cabecalho: 'Telemetria - Início', campo: 'telemetriaInicio', formato: 'data' },
  { cabecalho: 'Telemetria - Fim', campo: 'telemetriaFim', formato: 'data', campoCorrecao: 'telemetriaFim' },
  { cabecalho: 'Operando', campo: 'operando', formato: 'sim_nao' },
  { cabecalho: 'OBSERVAÇÃO 1', campo: null },
  { cabecalho: 'OBSERVAÇÃO 2', campo: null },
  { cabecalho: 'OBSERVAÇÃO 3', campo: null },
  { cabecalho: 'OBSERVAÇÃO 4', campo: null },
  { cabecalho: 'OBSERVAÇÃO 5', campo: null },
];

// Colunas extras de controle SPÁguas (não estão na planilha ANA original)
const COLUNAS_CONTROLE = [
  { cabecalho: 'STATUS_REVISAO_SPAGUAS' },
  { cabecalho: 'JUSTIFICATIVA_SPAGUAS' },
] as const;

const PREENCHIMENTO_AMARELO: ExcelJS.FillPattern = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFFFFF00' },
};

function valorParaCelula(
  estacao: AnaRevisaoEstacao,
  col: (typeof COLUNAS)[number],
): unknown {
  // Aplica correção sobrescrita pelo Marcio (campo sem `_sugerido`)
  if (col.campoCorrecao) {
    const corrigido = (estacao.correcoes as Record<string, unknown>)[
      col.campoCorrecao
    ];
    if (corrigido !== undefined) {
      return corrigido === '' ? null : corrigido;
    }
  }
  if (!col.campo) return null;
  const v = estacao[col.campo];
  if (v === null || v === undefined) return null;
  return v;
}

function foiAlterado(estacao: AnaRevisaoEstacao, campoCorrecao?: string): boolean {
  if (!campoCorrecao) return false;
  const c = estacao.correcoes as Record<string, unknown>;
  return c[campoCorrecao] !== undefined;
}

export async function exportarInventarioAna(
  repo: AnaRevisaoRepository,
  loteId: string,
): Promise<{ buffer: Buffer; nomeArquivo: string }> {
  // Pega tudo: até 200 por página, então faz paginação até esgotar.
  const todos: AnaRevisaoEstacao[] = [];
  const POR_PAGINA = 200;
  let pagina = 1;
  for (;;) {
    const r = await repo.listar(loteId, { pagina, porPagina: POR_PAGINA });
    todos.push(...r.itens);
    if (todos.length >= r.total || r.itens.length === 0) break;
    pagina += 1;
    if (pagina > 200) break; // sanity
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = 'SPAguas Ficha Tecnica';
  wb.created = new Date();

  const ws = wb.addWorksheet('DÚVIDAS', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  // Cabeçalho
  const cabecalhos = [...COLUNAS.map((c) => c.cabecalho), ...COLUNAS_CONTROLE.map((c) => c.cabecalho)];
  ws.addRow(cabecalhos);
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
  headerRow.height = 30;
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' },
    };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF808080' } },
      left: { style: 'thin', color: { argb: 'FF808080' } },
      bottom: { style: 'thin', color: { argb: 'FF808080' } },
      right: { style: 'thin', color: { argb: 'FF808080' } },
    };
  });

  // Linhas
  for (const estacao of todos) {
    const valoresFixos: Record<string, unknown> = {
      'Responsável - UF': estacao.estadoSigla === 'SP' ? 'SP' : estacao.estadoSigla,
      'OBSERVAÇÃO 1': estacao.observacoes[0] ?? null,
      'OBSERVAÇÃO 2': estacao.observacoes[1] ?? null,
      'OBSERVAÇÃO 3': estacao.observacoes[2] ?? null,
      'OBSERVAÇÃO 4': estacao.observacoes[3] ?? null,
      'OBSERVAÇÃO 5': estacao.observacoes[4] ?? null,
    };

    const valores: unknown[] = [];
    const alteradosIndices = new Set<number>();

    for (let i = 0; i < COLUNAS.length; i += 1) {
      const col = COLUNAS[i]!;
      let v: unknown;
      if (col.cabecalho in valoresFixos) {
        v = valoresFixos[col.cabecalho];
      } else {
        v = valorParaCelula(estacao, col);
      }
      if (col.formato === 'sim_nao') {
        v = v === true ? 'Sim' : v === false ? 'Não' : v;
      } else if (col.formato === 'data' && typeof v === 'string') {
        // ISO date YYYY-MM-DD vira Date pra Excel renderizar
        const d = new Date(`${v}T00:00:00Z`);
        if (!Number.isNaN(d.getTime())) v = d;
      }
      valores.push(v);
      if (foiAlterado(estacao, col.campoCorrecao)) {
        alteradosIndices.add(i);
      }
    }

    // Colunas extras de controle
    valores.push(estacao.status);
    valores.push(estacao.justificativa);

    const row = ws.addRow(valores);

    // Marca em amarelo as células alteradas
    for (const idx of alteradosIndices) {
      const cell = row.getCell(idx + 1);
      cell.fill = PREENCHIMENTO_AMARELO;
    }
  }

  // Largura razoável
  ws.columns.forEach((col) => {
    col.width = 18;
  });

  // Auto-filter na primeira linha
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: cabecalhos.length },
  };

  const buf = await wb.xlsx.writeBuffer();
  const nomeArquivo = `SP_AGUAS_Inventario_${new Date().toISOString().slice(0, 10)}.xlsx`;
  return { buffer: Buffer.from(buf), nomeArquivo };
}
