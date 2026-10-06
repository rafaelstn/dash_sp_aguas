import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CABECALHO_MOVIMENTACAO,
  CABECALHO_QUANTIFICAVEL,
  CABECALHO_SERIALIZADO,
  formatarDataHora,
  linhaMovimentacao,
  linhaQuantificavel,
  linhaSerializado,
  mapaOperadores,
  rotuloEstado,
  rotuloItem,
  rotuloNatureza,
  rotuloOperador,
  rotuloStatus,
  rotuloTipoMov,
  rotuloTransicaoEstado,
  rotuloTransicaoStatus,
  UUID_SISTEMA_IMPORT,
  type MovimentacaoExport,
  type SaldoExport,
  type UnidadeExport,
} from '@/domain/estoque/export';

describe('estoque/export, rotulos', () => {
  it('estado/status capitalizados; "Não informado" quando nulo', () => {
    expect(rotuloEstado('bom')).toBe('Bom');
    expect(rotuloEstado('sucata')).toBe('Sucata');
    expect(rotuloEstado(null)).toBe('Não informado');
    expect(rotuloStatus('ativo')).toBe('Ativo');
    expect(rotuloStatus('descarte')).toBe('Descarte');
    expect(rotuloStatus(null)).toBe('Não informado');
  });

  it('tipo de movimentacao com acento correto', () => {
    expect(rotuloTipoMov('saida')).toBe('Saída');
    expect(rotuloTipoMov('transferencia')).toBe('Transferência');
    expect(rotuloTipoMov('entrada')).toBe('Entrada');
  });

  it('natureza derivada do alvo (unidadeId => serializado)', () => {
    expect(rotuloNatureza({ unidadeId: 'u1' })).toBe('Serializado');
    expect(rotuloNatureza({ unidadeId: null })).toBe('Quantificável');
  });

  it('transicao anterior->novo so quando muda; vazio quando igual', () => {
    expect(rotuloTransicaoEstado('bom', 'defeito')).toBe('Bom -> Defeito');
    expect(rotuloTransicaoEstado('bom', 'bom')).toBe('');
    expect(rotuloTransicaoEstado(null, null)).toBe('');
    expect(rotuloTransicaoStatus('ativo', 'descarte')).toBe('Ativo -> Descarte');
    expect(rotuloTransicaoStatus(null, null)).toBe('');
  });
});

describe('estoque/export, rotuloOperador (resolucao de identidade)', () => {
  it('UUID de sistema do import vira "Importação"', () => {
    expect(rotuloOperador(UUID_SISTEMA_IMPORT, undefined)).toBe('Importação');
  });

  it('prefere nome; cai para email; senao o id cru (gap)', () => {
    expect(rotuloOperador('u1', { nome: 'Maria Silva', email: 'maria@sp.gov.br' })).toBe(
      'Maria Silva',
    );
    expect(rotuloOperador('u1', { nome: null, email: 'maria@sp.gov.br' })).toBe('maria@sp.gov.br');
    expect(rotuloOperador('u1', { nome: '   ', email: '  ' })).toBe('u1');
    expect(rotuloOperador('u1', undefined)).toBe('u1');
  });
});

describe('estoque/export, mapaOperadores (batch id -> rotulo)', () => {
  it('resolve ids distintos pelo nome/email do mapa de identidades', () => {
    const identidades = new Map([
      ['u1', { nome: 'Maria Silva', email: 'maria@sp.gov.br' }],
      ['u2', { nome: null, email: 'joao@sp.gov.br' }],
    ]);
    const mapa = mapaOperadores(['u1', 'u2'], identidades);
    expect(mapa.get('u1')).toBe('Maria Silva');
    expect(mapa.get('u2')).toBe('joao@sp.gov.br');
    expect(mapa.size).toBe(2);
  });

  it('degrada para o id cru quando a identidade nao foi resolvida (mapa vazio)', () => {
    const mapa = mapaOperadores(['u1', 'u2'], new Map());
    expect(mapa.get('u1')).toBe('u1');
    expect(mapa.get('u2')).toBe('u2');
  });

  it('UUID de sistema do import vira "Importação" mesmo sem identidade', () => {
    const mapa = mapaOperadores([UUID_SISTEMA_IMPORT], new Map());
    expect(mapa.get(UUID_SISTEMA_IMPORT)).toBe('Importação');
  });

  it('deduplica ids repetidos (uma entrada por id)', () => {
    const identidades = new Map([['u1', { nome: 'Ana', email: null }]]);
    const mapa = mapaOperadores(['u1', 'u1', 'u1'], identidades);
    expect(mapa.size).toBe(1);
    expect(mapa.get('u1')).toBe('Ana');
  });
});

describe('estoque/export, formatarDataHora (America/Sao_Paulo, deterministico)', () => {
  it('formata YYYY-MM-DD HH:mm no fuso de Sao Paulo (UTC-3)', () => {
    // 00:30Z => 21:30 do dia anterior em Sao Paulo.
    expect(formatarDataHora(new Date('2026-07-15T00:30:00Z'))).toBe('2026-07-14 21:30');
    expect(formatarDataHora(new Date('2026-07-15T18:05:00Z'))).toBe('2026-07-15 15:05');
  });
});

describe('estoque/export, linhas do xlsx', () => {
  const baseUnidade: UnidadeExport = {
    id: 'u1',
    materialId: null,
    codigo: 'COD-1',
    codigoSpaguas: 'SPA26',
    patDaee: 'PAT-9',
    outrosPat: null,
    numeroSerie: 'SN-123',
    helice: null,
    descricao: 'Datalogger',
    marca: 'OTT',
    modelo: 'X',
    estado: 'bom',
    status: 'ativo',
    localId: 'l1',
    dataAquisicao: '2025-01-10',
    observacao: 'em campo',
    chaveImport: null,
    criadoEm: new Date('2025-01-10T12:00:00Z'),
    atualizadoEm: new Date('2025-01-10T12:00:00Z'),
    unidadeFisica: 'PENHA',
    localRotulo: 'PENHA / SALA 2',
  };

  it('serializado: ordem das colunas, nulos vazios, estado/situacao rotulados', () => {
    const linha = linhaSerializado(baseUnidade);
    expect(linha).toHaveLength(CABECALHO_SERIALIZADO.length);
    expect(linha).toEqual([
      'Datalogger',
      'OTT',
      'X',
      'COD-1',
      'SPA26',
      'PAT-9',
      '', // outros pat nulo
      'SN-123',
      '', // helice nulo
      'PENHA',
      'PENHA / SALA 2',
      'Bom',
      'Ativo',
      '2025-01-10',
      'em campo',
    ]);
  });

  it('serializado sem estado: "Não informado"', () => {
    const linha = linhaSerializado({ ...baseUnidade, estado: null });
    expect(linha[11]).toBe('Não informado');
  });

  it('quantificavel: material/categoria e quantidade numerica', () => {
    const saldo: SaldoExport = {
      materialDescricao: 'Cabo coaxial',
      marca: 'Aquario',
      modelo: null,
      categoria: 'Cabos',
      unidadeFisica: 'ARARAQUARA',
      localRotulo: 'ARARAQUARA / SALA 1',
      tamanho: 'RG-58',
      quantidade: 42,
    };
    const linha = linhaQuantificavel(saldo);
    expect(linha).toHaveLength(CABECALHO_QUANTIFICAVEL.length);
    expect(linha).toEqual([
      'Cabo coaxial',
      'Aquario',
      '',
      'Cabos',
      'ARARAQUARA',
      'ARARAQUARA / SALA 1',
      'RG-58',
      42,
    ]);
  });

  const baseMov: MovimentacaoExport = {
    id: 'm1',
    tipo: 'transferencia',
    unidadeId: 'u1',
    materialId: null,
    quantidade: 1,
    localOrigemId: 'l1',
    localDestinoId: 'l2',
    estadoAnterior: 'bom',
    estadoNovo: 'bom',
    statusAnterior: 'ativo',
    statusNovo: 'ativo',
    motivo: null,
    usuarioId: 'user-1',
    conferenciaId: null,
    solicitanteMatricula: null,
    criadoEm: new Date('2026-07-15T18:05:00Z'),
    itemDescricao: 'Datalogger',
    itemIdentificacao: 'PAT-9',
    localOrigemRotulo: 'PENHA / SALA 2',
    localDestinoRotulo: 'ARARAQUARA / SALA 1',
  };

  it('rotuloItem: serializado inclui patrimonio; material so descricao', () => {
    expect(rotuloItem(baseMov)).toBe('Datalogger (PAT-9)');
    expect(
      rotuloItem({ ...baseMov, unidadeId: null, materialId: 'mat1', itemIdentificacao: null }),
    ).toBe('Datalogger');
  });

  it('movimentacao: data, tipo, natureza, item, operador resolvido', () => {
    const linha = linhaMovimentacao(baseMov, 'Maria Silva');
    expect(linha).toHaveLength(CABECALHO_MOVIMENTACAO.length);
    expect(linha).toEqual([
      '2026-07-15 15:05',
      'Transferência',
      'Serializado',
      'Datalogger (PAT-9)',
      1,
      'PENHA / SALA 2',
      'ARARAQUARA / SALA 1',
      '', // estado sem mudanca
      '', // situacao sem mudanca
      '', // motivo nulo
      'Maria Silva',
      '', // solicitante: transferencia nao tem solicitante
    ]);
  });

  it('movimentacao de saida leva a matricula do solicitante na ultima coluna', () => {
    // A coluna entrou em 06/10/2026 com a migration 0075. O indice sai do
    // CABECALHO e nao do numero 11 escrito a mao: coluna nova no meio desloca
    // tudo, e regua com indice fixo passaria a medir a celula errada calada.
    const iSolicitante = CABECALHO_MOVIMENTACAO.indexOf('Solicitante (matrícula)');
    expect(iSolicitante).toBeGreaterThanOrEqual(0);
    const linha = linhaMovimentacao(
      {
        ...baseMov,
        tipo: 'saida',
        localDestinoId: null,
        localDestinoRotulo: null,
        solicitanteMatricula: 'SP-482913',
      },
      'Maria Silva',
    );
    expect(linha).toHaveLength(CABECALHO_MOVIMENTACAO.length);
    expect(linha[iSolicitante]).toBe('SP-482913');
    // Operador e solicitante sao papeis diferentes e ocupam celulas diferentes:
    // sem esta assercao, trocar uma pela outra ficaria verde.
    expect(linha[CABECALHO_MOVIMENTACAO.indexOf('Operador')]).toBe('Maria Silva');
  });

  it('movimentacao com mudanca de status mostra a transicao', () => {
    const linha = linhaMovimentacao(
      { ...baseMov, tipo: 'baixa', statusAnterior: 'ativo', statusNovo: 'descarte', motivo: 'sucata' },
      'Importação',
    );
    expect(linha[1]).toBe('Baixa');
    expect(linha[8]).toBe('Ativo -> Descarte');
    expect(linha[9]).toBe('sucata');
    expect(linha[10]).toBe('Importação');
  });
});

/**
 * Catraca das larguras da planilha de movimentacoes.
 *
 * Por que ela existe: a coluna nova de 06/10/2026 (Solicitante) entrou em TRES
 * lugares que ninguem comparava (cabecalho, linha e larguras), e largura a menos
 * nao quebra nada: a ultima coluna sai com a largura padrao do Excel e o defeito
 * atravessa a entrega. O cabecalho e a linha ja se conferem pelo caso acima.
 *
 * O que ela mede: a QUANTIDADE de larguras no texto de
 * src/application/use-cases/estoque/exportar-estoque.ts, contra
 * CABECALHO_MOVIMENTACAO.length (lado mais rico, importado e nao copiado).
 *
 * O que ela NAO mede: que o Excel aplicou a largura. `LARGURAS_MOVIMENTACAO` nao
 * e exportado, e o modulo importa `server-only` e o exceljs, que fora do
 * `next build` nao sobem nesta suite. Isto e assercao de FORMA, de proposito, e
 * esta dito aqui para ninguem a ler como prova de renderizacao.
 */
describe('export de movimentacoes, larguras x cabecalho', () => {
  it('ha uma largura para cada coluna do cabecalho', () => {
    const fonte = readFileSync(
      resolve(process.cwd(), 'src/application/use-cases/estoque/exportar-estoque.ts'),
      'utf-8',
    );
    const m = fonte.match(/const LARGURAS_MOVIMENTACAO = \[([^\]]*)\]/);
    // Ancora de PRESENCA: sem ela, renomear a constante deixaria a contagem
    // comparando zero com zero e a regua aprovaria o arquivo inteiro.
    expect(m).not.toBeNull();
    const larguras = m![1]!
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map(Number);
    expect(larguras.every((n) => Number.isFinite(n) && n > 0)).toBe(true);
    expect(larguras).toHaveLength(CABECALHO_MOVIMENTACAO.length);
  });
});
