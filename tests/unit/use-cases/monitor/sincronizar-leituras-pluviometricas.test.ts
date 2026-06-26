import { describe, expect, it } from 'vitest';
import {
  momentoSibhParaData,
  sincronizarLeiturasPluviometricas,
} from '@/application/use-cases/monitor/sincronizar-leituras-pluviometricas';
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
    gapMinutos: 60,
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

describe('momentoSibhParaData', () => {
  it('interpreta horário de Brasília (UTC-3) e converte para instante UTC', () => {
    // 13:00 em Brasília (UTC-3) é 16:00 UTC.
    const d = momentoSibhParaData('2026/01/15 13:00');
    expect(d).not.toBeNull();
    expect(d!.toISOString()).toBe('2026-01-15T16:00:00.000Z');
  });

  it('é determinístico (não depende do timezone do servidor)', () => {
    const a = momentoSibhParaData('2026/06/30 00:00');
    // 00:00 Brasília vira 03:00 UTC do mesmo dia.
    expect(a!.toISOString()).toBe('2026-06-30T03:00:00.000Z');
  });

  it('retorna null para formato inesperado', () => {
    expect(momentoSibhParaData('15-01-2026 13h')).toBeNull();
    expect(momentoSibhParaData('')).toBeNull();
  });
});

describe('use-case/sincronizarLeiturasPluviometricas', () => {
  it('grava só o canal automatico, manual fica em 0', async () => {
    const sibh = fakeSibh({
      P001: [medicao({ valorMm: 5, momento: '2026/01/15 10:00' })],
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
    expect(resumo.medicoesRecebidas).toBe(1);
    expect(resumo.linhasGravadas).toBe(1);
    const leitura = repo.lotes[0]![0]!;
    expect(leitura.estacaoId).toBe('estacao-1');
    expect(leitura.automaticoMm).toBe(5);
    expect(leitura.manualMm).toBe(0);
    expect(leitura.momento.toISOString()).toBe('2026-01-15T13:00:00.000Z');
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

  it('descarta medição com carimbo malformado', async () => {
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

  it('upsert idempotente: reprocessar a mesma janela não duplica (chave estacao+momento)', async () => {
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
