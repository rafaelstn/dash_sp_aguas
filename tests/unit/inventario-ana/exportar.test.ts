/**
 * Testes do use case exportarInventarioAna.
 *
 * Validações:
 *   - Cabeçalho preservado (42 colunas ANA + 2 colunas controle SPÁguas).
 *   - Células alteradas (presença em correcoes JSONB) pintadas em amarelo.
 *   - Linhas de status correto.
 *   - Buffer é XLSX válido (assinatura PK do zip).
 */
import { afterEach, describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import {
  _resetMockAna,
  _seedMockAnaLote,
  _seedMockAnaEstacao,
  _criarLoteMock,
  _criarEstacaoMock,
  anaRevisaoRepository,
} from '@/infrastructure/mock/ana-revisao-repository.mock';
import { exportarInventarioAna } from '@/application/use-cases/inventario-ana/exportar';

const LOTE = '55555555-5555-4555-8555-555555555555';

describe('exportarInventarioAna', () => {
  afterEach(() => _resetMockAna());

  it('gera XLSX válido com cabeçalho ANA + colunas controle', async () => {
    _seedMockAnaLote(_criarLoteMock({ id: LOTE, nome: 'export' }));
    _seedMockAnaEstacao(
      _criarEstacaoMock({
        id: 'e1',
        loteId: LOTE,
        codigoAna: '1949001',
        nome: 'RIOLANDIA',
        municipioNome: 'Riolândia',
      }),
    );

    const { buffer, nomeArquivo } = await exportarInventarioAna(
      anaRevisaoRepository,
      LOTE,
    );

    // Buffer é zip (XLSX). Assinatura PK\x03\x04
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
    expect(nomeArquivo).toMatch(/SP_AGUAS_Inventario_\d{4}-\d{2}-\d{2}\.xlsx/);

    // Reabre o XLSX e valida estrutura
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer.buffer as ArrayBuffer);
    const ws = wb.getWorksheet('DÚVIDAS');
    expect(ws).toBeTruthy();

    const header = ws!.getRow(1);
    expect(header.getCell(1).value).toBe('Responsável - UF');
    expect(header.getCell(2).value).toBe('Estação - Código');
    expect(header.getCell(3).value).toBe('Estação - Nome');
    // Última coluna ANA (Observação 5) + 2 de controle
    const lastCol = ws!.columnCount;
    expect(header.getCell(lastCol).value).toBe('JUSTIFICATIVA_SPAGUAS');
    expect(header.getCell(lastCol - 1).value).toBe('STATUS_REVISAO_SPAGUAS');
  });

  it('marca em amarelo (FFFF00) células com correção aplicada', async () => {
    _seedMockAnaLote(_criarLoteMock({ id: LOTE, nome: 'export' }));
    _seedMockAnaEstacao(
      _criarEstacaoMock({
        id: 'e1',
        loteId: LOTE,
        codigoAna: '1949001',
        nome: 'NOME ORIGINAL',
        municipioNome: 'Cruzeiro',
        // Correção aplicada manualmente: município mudou para Piquete
        correcoes: { municipioNome: 'Piquete' },
        status: 'revisada',
      }),
    );

    const { buffer } = await exportarInventarioAna(
      anaRevisaoRepository,
      LOTE,
    );

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer.buffer as ArrayBuffer);
    const ws = wb.getWorksheet('DÚVIDAS');
    expect(ws).toBeTruthy();

    // Linha 2 = primeira estação. Coluna 20 = "Município - Nome".
    const row = ws!.getRow(2);
    const cellMun = row.getCell(20);
    expect(cellMun.value).toBe('Piquete');
    const fill = cellMun.fill as ExcelJS.FillPattern;
    expect(fill?.fgColor?.argb?.toUpperCase()).toBe('FFFFFF00');

    // Coluna sem correção (nome): não tem fill amarelo
    const cellNome = row.getCell(3);
    expect(cellNome.value).toBe('NOME ORIGINAL');
    const fillNome = cellNome.fill as ExcelJS.FillPattern | undefined;
    expect(fillNome?.fgColor?.argb?.toUpperCase()).not.toBe('FFFFFF00');
  });

  it('coluna STATUS_REVISAO_SPAGUAS reflete o status atual', async () => {
    _seedMockAnaLote(_criarLoteMock({ id: LOTE, nome: 'export' }));
    _seedMockAnaEstacao(
      _criarEstacaoMock({ id: 'e1', loteId: LOTE, codigoAna: '1', status: 'revisada' }),
    );
    _seedMockAnaEstacao(
      _criarEstacaoMock({ id: 'e2', loteId: LOTE, codigoAna: '2', status: 'descartada' }),
    );

    const { buffer } = await exportarInventarioAna(
      anaRevisaoRepository,
      LOTE,
    );
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer.buffer as ArrayBuffer);
    const ws = wb.getWorksheet('DÚVIDAS')!;

    const lastCol = ws.columnCount;
    // status fica em columnCount-1 (penúltima coluna), justificativa na última
    const statusCol = lastCol - 1;
    expect(ws.getRow(2).getCell(statusCol).value).toBe('revisada');
    expect(ws.getRow(3).getCell(statusCol).value).toBe('descartada');
  });

  it('lote vazio gera planilha apenas com cabeçalho', async () => {
    _seedMockAnaLote(_criarLoteMock({ id: LOTE, nome: 'vazio' }));
    const { buffer } = await exportarInventarioAna(
      anaRevisaoRepository,
      LOTE,
    );
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer.buffer as ArrayBuffer);
    const ws = wb.getWorksheet('DÚVIDAS')!;
    expect(ws.rowCount).toBe(1);
  });
});
