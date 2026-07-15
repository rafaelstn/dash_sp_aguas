import { describe, expect, it, vi } from 'vitest';
import { obterLeiturasComFallback } from '@/application/use-cases/monitor/obter-leituras-com-fallback';
import type {
  EstacaoSibh,
  LeituraSibh,
  MedicaoSibh,
  PontoNivelSibh,
  SibhGateway,
} from '@/application/ports/sibh-gateway';
import type { LeiturasPluviometricasRepository } from '@/application/ports/leituras-pluviometricas-repository';
import type {
  LeituraPluviometrica,
  UpsertLeituraPluviometrica,
} from '@/domain/monitor/leitura-pluviometrica';

/**
 * Espelha `SibhIndisponivelError` do adapter sem importar a infra (que carrega
 * `fetch`/`server-only`). Para o use-case, qualquer erro do gateway é tratado
 * igual: degrada por estação e devolve o que houver no banco.
 */
class SibhIndisponivelError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'SibhIndisponivelError';
  }
}

const DESDE = new Date('2026-01-15T00:00:00Z');
const ATE = new Date('2026-01-16T00:00:00Z');

function medicao(over: Partial<MedicaoSibh> = {}): MedicaoSibh {
  return {
    prefixo: 'P001',
    nome: 'Estação Teste',
    valorMm: 2.5,
    momento: '2026/01/15 10:00',
    gapMinutos: 10,
    ...over,
  };
}

function leituraBanco(over: Partial<LeituraPluviometrica> = {}): LeituraPluviometrica {
  return {
    id: 1,
    estacaoId: 'estacao-1',
    momento: new Date('2026-01-15T00:00:00Z'),
    manualMm: 0,
    automaticoMm: 5,
    criadoEm: new Date('2026-01-16T00:00:00Z'),
    ...over,
  };
}

/**
 * Repo fake in-memory: `upsertLote` materializa as leituras gravadas para que
 * a releitura do fallback as devolva (simula o ON CONFLICT do adapter real).
 */
function fakeRepo(inicial: LeituraPluviometrica[] = []): LeiturasPluviometricasRepository & {
  chamadasListar: number;
  gravadas: UpsertLeituraPluviometrica[];
} {
  let armazenadas = [...inicial];
  const gravadas: UpsertLeituraPluviometrica[] = [];
  return {
    chamadasListar: 0,
    gravadas,
    async listarPorEstacaoEPeriodo() {
      this.chamadasListar += 1;
      return [...armazenadas];
    },
    async upsertLote(leituras) {
      gravadas.push(...leituras);
      armazenadas = leituras.map((l, i) => ({
        id: i + 1,
        estacaoId: l.estacaoId,
        momento: l.momento,
        manualMm: l.manualMm,
        automaticoMm: l.automaticoMm,
        criadoEm: new Date(),
      }));
      return leituras.length;
    },
  };
}

function fakeSibh(
  medicoes: MedicaoSibh[] = [],
  comportamento?: { lanca?: Error },
): SibhGateway & { chamadas: number } {
  return {
    chamadas: 0,
    async listarEstacoes(): Promise<EstacaoSibh[]> {
      return [];
    },
    async medicoesPorPrefixo() {
      this.chamadas += 1;
      if (comportamento?.lanca) throw comportamento.lanca;
      return medicoes;
    },
    async serieNivelPorPrefixo(): Promise<PontoNivelSibh[]> {
      return [];
    },
    async valorAtualPorPrefixo(): Promise<LeituraSibh | null> {
      return null;
    },
  };
}

describe('use-case/obterLeiturasComFallback', () => {
  it('banco já tem série: devolve direto, NÃO chama o SIBH', async () => {
    const repo = fakeRepo([leituraBanco()]);
    const sibh = fakeSibh([medicao()]);

    const r = await obterLeiturasComFallback(
      sibh,
      repo,
      { id: 'estacao-1', prefixo: 'P001' },
      DESDE,
      ATE,
    );

    expect(r.leituras).toHaveLength(1);
    expect(r.origemFallbackSibh).toBe(false);
    expect(r.fallbackFalhou).toBe(false);
    expect(sibh.chamadas).toBe(0);
    expect(repo.chamadasListar).toBe(1);
  });

  it('banco vazio + prefixo: busca do SIBH, persiste, relê e marca origemFallbackSibh', async () => {
    const repo = fakeRepo([]);
    const sibh = fakeSibh([
      medicao({ momento: '2026/01/15 10:00', valorMm: 2 }),
      medicao({ momento: '2026/01/15 12:00', valorMm: 3 }),
    ]);
    const onFallback = vi.fn();

    const r = await obterLeiturasComFallback(
      sibh,
      repo,
      { id: 'estacao-1', prefixo: 'P001' },
      DESDE,
      ATE,
      onFallback,
    );

    expect(sibh.chamadas).toBe(1);
    // 2 medições do mesmo dia hidrológico viram 1 linha diária (total 5mm).
    expect(repo.gravadas).toHaveLength(1);
    expect(repo.gravadas[0]!.automaticoMm).toBe(5);
    expect(r.leituras).toHaveLength(1);
    expect(r.leituras[0]!.automaticoMm).toBe(5);
    expect(r.origemFallbackSibh).toBe(true);
    expect(r.fallbackFalhou).toBe(false);
    // listar chamado 2x: leitura inicial (vazia) + releitura pós-persistência.
    expect(repo.chamadasListar).toBe(2);
    expect(onFallback).toHaveBeenCalledWith({
      medicoesRecebidas: 2,
      linhasGravadas: 1,
      erros: 0,
    });
  });

  it('estação sem prefixo: devolve vazio sem tentar o SIBH', async () => {
    const repo = fakeRepo([]);
    const sibh = fakeSibh([medicao()]);

    const r = await obterLeiturasComFallback(
      sibh,
      repo,
      { id: 'estacao-1', prefixo: null },
      DESDE,
      ATE,
    );

    expect(r.leituras).toHaveLength(0);
    expect(r.origemFallbackSibh).toBe(false);
    expect(r.fallbackFalhou).toBe(false);
    expect(sibh.chamadas).toBe(0);
  });

  it('prefixo só com espaços em branco: tratado como sem prefixo, não chama o SIBH', async () => {
    const repo = fakeRepo([]);
    const sibh = fakeSibh([medicao()]);

    const r = await obterLeiturasComFallback(
      sibh,
      repo,
      { id: 'estacao-1', prefixo: '   ' },
      DESDE,
      ATE,
    );

    expect(sibh.chamadas).toBe(0);
    expect(r.leituras).toHaveLength(0);
  });

  it('SIBH sem medições no período: devolve vazio sem erro e sem marcar fallback', async () => {
    const repo = fakeRepo([]);
    const sibh = fakeSibh([]);

    const r = await obterLeiturasComFallback(
      sibh,
      repo,
      { id: 'estacao-1', prefixo: 'P001' },
      DESDE,
      ATE,
    );

    expect(sibh.chamadas).toBe(1);
    expect(repo.gravadas).toHaveLength(0);
    expect(r.leituras).toHaveLength(0);
    expect(r.origemFallbackSibh).toBe(false);
    expect(r.fallbackFalhou).toBe(false);
  });

  it('SIBH indisponível: tolera (não estoura), devolve o que houver no banco e marca fallbackFalhou', async () => {
    const repo = fakeRepo([]);
    const sibh = fakeSibh([], {
      lanca: new SibhIndisponivelError('Tempo de resposta excedido ao consultar o SIBH.'),
    });

    const r = await obterLeiturasComFallback(
      sibh,
      repo,
      { id: 'estacao-1', prefixo: 'P001' },
      DESDE,
      ATE,
    );

    expect(sibh.chamadas).toBe(1);
    expect(r.leituras).toHaveLength(0);
    expect(r.origemFallbackSibh).toBe(false);
    // O sync degrada por estação: a falha vira resumo.erros, sinalizada aqui.
    expect(r.fallbackFalhou).toBe(true);
  });
});
