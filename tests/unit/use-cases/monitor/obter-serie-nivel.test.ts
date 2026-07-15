import { describe, expect, it, vi } from 'vitest';
import {
  agregarNivelDiario,
  obterSerieNivel,
} from '@/application/use-cases/monitor/obter-serie-nivel';
import type {
  EstacaoSibh,
  LeituraSibh,
  MedicaoSibh,
  PontoNivelSibh,
  SibhGateway,
} from '@/application/ports/sibh-gateway';

/** Espelha `SibhIndisponivelError` sem importar a infra (server-only/fetch). */
class SibhIndisponivelError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'SibhIndisponivelError';
  }
}

const DESDE = new Date('2026-01-10T00:00:00Z');
const ATE = new Date('2026-01-20T00:00:00Z');

function ponto(over: Partial<PontoNivelSibh> = {}): PontoNivelSibh {
  return { momento: '2026/01/15 10:00', nivelM: 1.5, ...over };
}

function fakeSibh(
  pontos: PontoNivelSibh[] = [],
  comportamento?: { lanca?: Error },
): SibhGateway & { chamadas: number } {
  return {
    chamadas: 0,
    async listarEstacoes(): Promise<EstacaoSibh[]> {
      return [];
    },
    async medicoesPorPrefixo(): Promise<MedicaoSibh[]> {
      return [];
    },
    async serieNivelPorPrefixo() {
      this.chamadas += 1;
      if (comportamento?.lanca) throw comportamento.lanca;
      return pontos;
    },
    async valorAtualPorPrefixo(): Promise<LeituraSibh | null> {
      return null;
    },
  };
}

describe('domain/agregarNivelDiario (função pura)', () => {
  it('agrega por dia de calendário devolvendo média, mín e máx (2 casas)', () => {
    const itens = agregarNivelDiario([
      ponto({ momento: '2026/01/15 00:00', nivelM: 2 }),
      ponto({ momento: '2026/01/15 12:00', nivelM: 4 }),
      ponto({ momento: '2026/01/15 23:00', nivelM: 3 }),
    ]);

    expect(itens).toHaveLength(1);
    expect(itens[0]).toEqual({
      momento: '2026-01-15T00:00:00.000Z',
      nivelMedioM: 3, // (2+4+3)/3
      nivelMinM: 2,
      nivelMaxM: 4,
    });
  });

  it('NÃO usa dia hidrológico: medição às 06:59 fica no mesmo dia de calendário', () => {
    // Contraste com a chuva (07:00→06:59). Aqui o corte é o dia civil.
    const itens = agregarNivelDiario([
      ponto({ momento: '2026/01/15 06:59', nivelM: 1 }),
      ponto({ momento: '2026/01/15 07:00', nivelM: 3 }),
    ]);
    expect(itens).toHaveLength(1);
    expect(itens[0]!.momento).toBe('2026-01-15T00:00:00.000Z');
    expect(itens[0]!.nivelMedioM).toBe(2);
  });

  it('separa dias distintos e ordena crescente', () => {
    const itens = agregarNivelDiario([
      ponto({ momento: '2026/01/17 10:00', nivelM: 5 }),
      ponto({ momento: '2026/01/15 10:00', nivelM: 1 }),
      ponto({ momento: '2026/01/16 10:00', nivelM: 3 }),
    ]);
    expect(itens.map((i) => i.momento)).toEqual([
      '2026-01-15T00:00:00.000Z',
      '2026-01-16T00:00:00.000Z',
      '2026-01-17T00:00:00.000Z',
    ]);
  });

  it('arredonda média a 2 casas', () => {
    const itens = agregarNivelDiario([
      ponto({ momento: '2026/01/15 10:00', nivelM: 1 }),
      ponto({ momento: '2026/01/15 11:00', nivelM: 1 }),
      ponto({ momento: '2026/01/15 12:00', nivelM: 2 }),
    ]);
    // (1+1+2)/3 = 1.333... -> 1.33
    expect(itens[0]!.nivelMedioM).toBe(1.33);
  });

  it('ignora momento em formato inesperado e nível não finito', () => {
    const itens = agregarNivelDiario([
      ponto({ momento: '15-01-2026 10:00', nivelM: 9 }), // formato errado
      ponto({ momento: '2026/01/15 10:00', nivelM: Number.NaN }), // não finito
      ponto({ momento: '2026/01/15 11:00', nivelM: 2 }), // válido
    ]);
    expect(itens).toHaveLength(1);
    expect(itens[0]!.nivelMedioM).toBe(2);
  });

  it('série vazia devolve []', () => {
    expect(agregarNivelDiario([])).toEqual([]);
  });
});

describe('use-case/obterSerieNivel', () => {
  it('busca do SIBH e agrega por dia', async () => {
    const sibh = fakeSibh([
      ponto({ momento: '2026/01/15 10:00', nivelM: 2 }),
      ponto({ momento: '2026/01/15 14:00', nivelM: 4 }),
    ]);

    const r = await obterSerieNivel(sibh, { prefixo: '2D-028' }, DESDE, ATE);

    expect(sibh.chamadas).toBe(1);
    expect(r.itens).toHaveLength(1);
    expect(r.itens[0]!.nivelMedioM).toBe(3);
    expect(r.sibhIndisponivel).toBe(false);
    expect(r.semPrefixo).toBe(false);
  });

  it('estação sem prefixo: série vazia, sinaliza semPrefixo, não chama o SIBH', async () => {
    const sibh = fakeSibh([ponto()]);
    const r = await obterSerieNivel(sibh, { prefixo: null }, DESDE, ATE);
    expect(sibh.chamadas).toBe(0);
    expect(r.itens).toEqual([]);
    expect(r.semPrefixo).toBe(true);
    expect(r.sibhIndisponivel).toBe(false);
  });

  it('prefixo só com espaços: tratado como sem prefixo', async () => {
    const sibh = fakeSibh([ponto()]);
    const r = await obterSerieNivel(sibh, { prefixo: '   ' }, DESDE, ATE);
    expect(sibh.chamadas).toBe(0);
    expect(r.semPrefixo).toBe(true);
  });

  it('SIBH indisponível: tolera (não estoura), série vazia + flag e chama onErro', async () => {
    const sibh = fakeSibh([], {
      lanca: new SibhIndisponivelError('Tempo de resposta excedido ao consultar o SIBH.'),
    });
    const onErro = vi.fn();

    const r = await obterSerieNivel(sibh, { prefixo: '5B-505Z' }, DESDE, ATE, onErro);

    expect(sibh.chamadas).toBe(1);
    expect(r.itens).toEqual([]);
    expect(r.sibhIndisponivel).toBe(true);
    expect(r.semPrefixo).toBe(false);
    expect(onErro).toHaveBeenCalledOnce();
  });

  it('SIBH sem pontos no período: série vazia sem marcar indisponível', async () => {
    const sibh = fakeSibh([]);
    const r = await obterSerieNivel(sibh, { prefixo: '2D-028' }, DESDE, ATE);
    expect(sibh.chamadas).toBe(1);
    expect(r.itens).toEqual([]);
    expect(r.sibhIndisponivel).toBe(false);
  });
});
