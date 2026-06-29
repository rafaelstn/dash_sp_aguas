import { describe, expect, it } from 'vitest';
import { sincronizarLeiturasPluviometricas } from '@/application/use-cases/monitor/sincronizar-leituras-pluviometricas';
import type {
  EstacaoSibh,
  LeituraSibh,
  MedicaoSibh,
  SibhGateway,
} from '@/application/ports/sibh-gateway';
import type { LeiturasPluviometricasRepository } from '@/application/ports/leituras-pluviometricas-repository';
import type {
  LeituraPluviometrica,
  UpsertLeituraPluviometrica,
} from '@/domain/monitor/leitura-pluviometrica';

function medicao(over: Partial<MedicaoSibh>): MedicaoSibh {
  return {
    prefixo: 'P001',
    nome: 'Estação Teste',
    valorMm: 2.5,
    momento: '2026/01/15 13:00',
    gapMinutos: 10,
    ...over,
  };
}

function fakeSibh(
  porPrefixo: Record<string, MedicaoSibh[]>,
  onErro?: (prefixo: string) => void,
): SibhGateway {
  return {
    async listarEstacoes(): Promise<EstacaoSibh[]> {
      return [];
    },
    async medicoesPorPrefixo(prefixo) {
      onErro?.(prefixo);
      return porPrefixo[prefixo] ?? [];
    },
    async valorAtualPorPrefixo(): Promise<LeituraSibh | null> {
      return null;
    },
  };
}

interface FakeLeiturasRepo extends LeiturasPluviometricasRepository {
  lotes: UpsertLeituraPluviometrica[][];
}

function fakeLeiturasRepo(): FakeLeiturasRepo {
  const lotes: UpsertLeituraPluviometrica[][] = [];
  return {
    lotes,
    async listarPorEstacaoEPeriodo(): Promise<LeituraPluviometrica[]> {
      return [];
    },
    async upsertLote(leituras) {
      lotes.push(leituras);
      return leituras.length;
    },
  };
}

const DESDE = new Date('2026-01-15T00:00:00Z');
const ATE = new Date('2026-01-16T00:00:00Z');

describe('use-case/sincronizarLeiturasPluviometricas', () => {
  it('agrega as medições por dia hidrológico: 1 linha/dia, total somado, só canal automatico', async () => {
    // 3 medições do mesmo dia hidrológico (todas após 07:00) viram 1 linha
    // diária com a soma dos mm. Com gap de 10min, gravar cru geraria 3 linhas.
    const sibh = fakeSibh({
      P001: [
        medicao({ momento: '2026/01/15 10:00', valorMm: 2 }),
        medicao({ momento: '2026/01/15 10:10', valorMm: 3 }),
        medicao({ momento: '2026/01/15 12:00', valorMm: 1 }),
      ],
    });
    const repo = fakeLeiturasRepo();

    const resumo = await sincronizarLeiturasPluviometricas(
      sibh,
      repo,
      [{ id: 'estacao-1', prefixo: 'P001' }],
      DESDE,
      ATE,
    );

    expect(resumo.estacoesProcessadas).toBe(1);
    expect(resumo.medicoesRecebidas).toBe(3);
    expect(resumo.linhasGravadas).toBe(1);

    expect(repo.lotes[0]).toHaveLength(1);
    const leitura = repo.lotes[0]![0]!;
    expect(leitura.estacaoId).toBe('estacao-1');
    expect(leitura.automaticoMm).toBe(6);
    expect(leitura.manualMm).toBe(0);
    // momento = dia hidrológico ancorado em 00:00 UTC.
    expect(leitura.momento.toISOString()).toBe('2026-01-15T00:00:00.000Z');
  });

  it('respeita o corte do dia hidrológico (06:59 cai no dia anterior, 07:00 inicia o dia)', async () => {
    const sibh = fakeSibh({
      P001: [
        medicao({ momento: '2026/01/15 06:59', valorMm: 4 }), // dia 2026-01-14
        medicao({ momento: '2026/01/15 07:00', valorMm: 5 }), // dia 2026-01-15
      ],
    });
    const repo = fakeLeiturasRepo();

    const resumo = await sincronizarLeiturasPluviometricas(
      sibh,
      repo,
      [{ id: 'estacao-1', prefixo: 'P001' }],
      DESDE,
      ATE,
    );

    expect(resumo.linhasGravadas).toBe(2);
    const porData = Object.fromEntries(
      repo.lotes[0]!.map((l) => [l.momento.toISOString(), l.automaticoMm]),
    );
    expect(porData['2026-01-14T00:00:00.000Z']).toBe(4);
    expect(porData['2026-01-15T00:00:00.000Z']).toBe(5);
  });

  it('pula estação sem prefixo (não consultável no SIBH)', async () => {
    const sibh = fakeSibh({});
    const repo = fakeLeiturasRepo();

    const resumo = await sincronizarLeiturasPluviometricas(
      sibh,
      repo,
      [{ id: 'estacao-1', prefixo: null }],
      DESDE,
      ATE,
    );

    expect(resumo.estacoesSemPrefixo).toBe(1);
    expect(resumo.estacoesProcessadas).toBe(0);
    expect(repo.lotes).toHaveLength(0);
  });

  it('descarta medição com carimbo malformado antes de agregar', async () => {
    const sibh = fakeSibh({
      P001: [
        medicao({ momento: '2026/01/15 10:00', valorMm: 3 }),
        medicao({ momento: 'lixo', valorMm: 9 }),
      ],
    });
    const repo = fakeLeiturasRepo();

    const resumo = await sincronizarLeiturasPluviometricas(
      sibh,
      repo,
      [{ id: 'estacao-1', prefixo: 'P001' }],
      DESDE,
      ATE,
    );

    expect(resumo.medicoesRecebidas).toBe(2);
    expect(resumo.linhasGravadas).toBe(1);
    expect(repo.lotes[0]).toHaveLength(1);
    expect(repo.lotes[0]![0]!.automaticoMm).toBe(3);
  });

  it('tolera falha por estação sem derrubar o lote', async () => {
    const sibh = fakeSibh(
      {
        BOM1: [medicao({ prefixo: 'BOM1', momento: '2026/01/15 10:00' })],
        BOM2: [medicao({ prefixo: 'BOM2', momento: '2026/01/15 11:00' })],
      },
      (prefixo) => {
        if (prefixo === 'RUIM') throw new Error('falha simulada SIBH');
      },
    );
    const repo = fakeLeiturasRepo();

    const resumo = await sincronizarLeiturasPluviometricas(
      sibh,
      repo,
      [
        { id: 'e1', prefixo: 'BOM1' },
        { id: 'e2', prefixo: 'RUIM' },
        { id: 'e3', prefixo: 'BOM2' },
      ],
      DESDE,
      ATE,
    );

    expect(resumo.estacoesProcessadas).toBe(2);
    expect(resumo.linhasGravadas).toBe(2);
    expect(resumo.erros).toHaveLength(1);
    expect(resumo.erros[0]!.prefixo).toBe('RUIM');
  });

  it('upsert idempotente: reprocessar a mesma janela reenvia a mesma chave (estacao+momento)', async () => {
    // O fake conta o que foi enviado; a idempotência real está no ON CONFLICT
    // do adapter. Aqui validamos que o use-case reenvia a mesma chave estável
    // (estacaoId + momento), pré-requisito para o upsert ser idempotente.
    const sibh = fakeSibh({
      P001: [medicao({ momento: '2026/01/15 10:00', valorMm: 4 })],
    });
    const repo = fakeLeiturasRepo();
    const alvo = [{ id: 'estacao-1', prefixo: 'P001' }];

    await sincronizarLeiturasPluviometricas(sibh, repo, alvo, DESDE, ATE);
    await sincronizarLeiturasPluviometricas(sibh, repo, alvo, DESDE, ATE);

    const primeira = repo.lotes[0]![0]!;
    const segunda = repo.lotes[1]![0]!;
    expect(segunda.estacaoId).toBe(primeira.estacaoId);
    expect(segunda.momento.toISOString()).toBe(primeira.momento.toISOString());
  });
});
