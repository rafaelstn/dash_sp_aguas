import 'server-only';
import ExcelJS from 'exceljs';
import { FalhaRepositorio } from '@/domain/errors';
import type { EstoqueUnidadesRepository } from '@/application/ports/estoque-unidades-repository';
import type { EstoqueSaldosRepository } from '@/application/ports/estoque-saldos-repository';
import type { EstoqueMovimentacoesRepository } from '@/application/ports/estoque-movimentacoes-repository';
import type { UsuariosIdentidadeRepository } from '@/application/ports/usuarios-identidade-repository';
import type { FiltrosUnidade } from '@/domain/estoque/unidade';
import type { FiltrosSaldo } from '@/domain/estoque/saldo';
import type { FiltrosMovimentacao } from '@/domain/estoque/movimentacao';
import {
  CABECALHO_MOVIMENTACAO,
  CABECALHO_QUANTIFICAVEL,
  CABECALHO_SERIALIZADO,
  linhaMovimentacao,
  linhaQuantificavel,
  linhaSerializado,
  mapaOperadores,
  TETO_EXPORT,
  type CelulaExport,
} from '@/domain/estoque/export';

/**
 * Exportador do Estoque para XLSX. Orquestra: le TUDO que casa o filtro (sem
 * paginacao, teto TETO_EXPORT), resolve o operador em lote (so movimentacoes) e
 * monta o workbook via as funcoes puras do dominio. Nao acessa banco direto:
 * recebe os repositorios por parametro (mesma injecao das rotas).
 */

export type TipoExport = 'serializado' | 'quantificavel' | 'movimentacoes';

export interface DepsExportEstoque {
  unidadesRepo: EstoqueUnidadesRepository;
  saldosRepo: EstoqueSaldosRepository;
  movimentacoesRepo: EstoqueMovimentacoesRepository;
  identidadeRepo: UsuariosIdentidadeRepository;
}

export interface FiltrosExportEstoque {
  serializado: FiltrosUnidade;
  quantificavel: FiltrosSaldo;
  movimentacoes: FiltrosMovimentacao;
}

export interface ResultadoExportEstoque {
  buffer: Buffer;
  nomeArquivo: string;
  /** Total de linhas de dados exportadas (sem o cabecalho). */
  total: number;
  /** True quando o resultado atingiu o teto e PODE ter sido truncado. */
  truncado: boolean;
}

interface PlanilhaMontada {
  aba: string;
  cabecalho: readonly string[];
  linhas: CelulaExport[][];
  larguras: number[];
}

const LARGURAS_SERIALIZADO = [34, 16, 16, 14, 18, 16, 14, 20, 12, 12, 28, 12, 12, 16, 40];
const LARGURAS_QUANTIFICAVEL = [34, 16, 16, 18, 12, 28, 14, 12];
const LARGURAS_MOVIMENTACAO = [18, 15, 14, 40, 12, 24, 24, 22, 22, 30, 26];

/** Data AAAA-MM-DD (hora de Sao Paulo) para o nome do arquivo. */
function dataArquivo(agora: Date): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(agora);
}

async function montarSerializado(
  deps: DepsExportEstoque,
  filtros: FiltrosUnidade,
): Promise<PlanilhaMontada> {
  const itens = await deps.unidadesRepo.listarParaExport(filtros);
  return {
    aba: 'Serializados',
    cabecalho: CABECALHO_SERIALIZADO,
    linhas: itens.map(linhaSerializado),
    larguras: LARGURAS_SERIALIZADO,
  };
}

async function montarQuantificavel(
  deps: DepsExportEstoque,
  filtros: FiltrosSaldo,
): Promise<PlanilhaMontada> {
  const itens = await deps.saldosRepo.listarParaExport(filtros);
  return {
    aba: 'Quantificaveis',
    cabecalho: CABECALHO_QUANTIFICAVEL,
    linhas: itens.map(linhaQuantificavel),
    larguras: LARGURAS_QUANTIFICAVEL,
  };
}

async function montarMovimentacoes(
  deps: DepsExportEstoque,
  filtros: FiltrosMovimentacao,
): Promise<PlanilhaMontada> {
  const itens = await deps.movimentacoesRepo.listarParaExport(filtros);
  // Resolve os operadores em UM SELECT (batch) e mapeia cada id pelo rotulo do
  // dominio (mesma regra da trilha; fallback "Importacao"/id cru). O export
  // NAO degrada: se o resolver falhar, o erro sobe e vira FalhaRepositorio.
  const identidades = await deps.identidadeRepo.resolver(itens.map((m) => m.usuarioId));
  const operadores = mapaOperadores(itens.map((m) => m.usuarioId), identidades);
  return {
    aba: 'Movimentacoes',
    cabecalho: CABECALHO_MOVIMENTACAO,
    linhas: itens.map((m) =>
      linhaMovimentacao(m, operadores.get(m.usuarioId) ?? m.usuarioId),
    ),
    larguras: LARGURAS_MOVIMENTACAO,
  };
}

async function gerarBuffer(planilha: PlanilhaMontada): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SPAguas Ficha Tecnica';
  wb.created = new Date();
  const ws = wb.addWorksheet(planilha.aba, { views: [{ state: 'frozen', ySplit: 1 }] });

  ws.addRow([...planilha.cabecalho]);
  const header = ws.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: 'middle', horizontal: 'left' };

  for (const linha of planilha.linhas) ws.addRow(linha);

  planilha.larguras.forEach((largura, i) => {
    ws.getColumn(i + 1).width = largura;
  });
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: planilha.cabecalho.length },
  };

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export async function exportarEstoque(
  deps: DepsExportEstoque,
  tipo: TipoExport,
  filtros: FiltrosExportEstoque,
  agora: Date,
): Promise<ResultadoExportEstoque> {
  try {
    let planilha: PlanilhaMontada;
    switch (tipo) {
      case 'serializado':
        planilha = await montarSerializado(deps, filtros.serializado);
        break;
      case 'quantificavel':
        planilha = await montarQuantificavel(deps, filtros.quantificavel);
        break;
      case 'movimentacoes':
        planilha = await montarMovimentacoes(deps, filtros.movimentacoes);
        break;
    }

    const buffer = await gerarBuffer(planilha);
    return {
      buffer,
      nomeArquivo: `estoque-${tipo}-${dataArquivo(agora)}.xlsx`,
      total: planilha.linhas.length,
      truncado: planilha.linhas.length >= TETO_EXPORT,
    };
  } catch (e) {
    throw new FalhaRepositorio('exportarEstoque', e);
  }
}
