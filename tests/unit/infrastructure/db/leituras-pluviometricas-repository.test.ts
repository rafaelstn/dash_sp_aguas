import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  leiturasPluviometricasRepository as repo,
  _resetLeiturasPluviometricasMock,
} from '@/infrastructure/mock/leituras-pluviometricas-repository.mock';
import type { UpsertLeituraPluviometrica } from '@/domain/monitor/leitura-pluviometrica';

/**
 * Testes do repositório de leituras pluviométricas (Monitor, fase B1.1).
 *
 * Exercita o adapter mock in-memory, que espelha a lógica observável do .pg:
 * filtro por estação e janela [desde, ate], ordenação crescente por momento e
 * upsert de lote idempotente via chave (estacaoId, momento). O .pg real é
 * coberto por regressão estática de schema no fim do arquivo.
 */

const EST = '00000000-0000-4000-8000-000000000001';
const OUTRA = '00000000-0000-4000-8000-000000000002';

function leitura(iso: string, over: Partial<UpsertLeituraPluviometrica> = {}): UpsertLeituraPluviometrica {
  return {
    estacaoId: EST,
    momento: new Date(iso),
    manualMm: 0,
    automaticoMm: 0,
    ...over,
  };
}

describe('leituras pluviométricas (mock) — upsertLote', () => {
  afterEach(() => {
    _resetLeiturasPluviometricasMock();
  });

  it('insere lote novo e retorna a quantidade afetada', async () => {
    const n = await repo.upsertLote([
      leitura('2026-06-20T10:00:00.000Z', { automaticoMm: 1.2 }),
      leitura('2026-06-20T11:00:00.000Z', { automaticoMm: 2.4 }),
    ]);
    expect(n).toBe(2);
  });

  it('lote vazio não faz nada e retorna 0', async () => {
    expect(await repo.upsertLote([])).toBe(0);
  });

  it('é idempotente: reenviar o mesmo (estacao, momento) atualiza, não duplica', async () => {
    await repo.upsertLote([leitura('2026-06-20T10:00:00.000Z', { automaticoMm: 1.0 })]);
    await repo.upsertLote([leitura('2026-06-20T10:00:00.000Z', { automaticoMm: 9.9, manualMm: 5.5 })]);

    const linhas = await repo.listarPorEstacaoEPeriodo(
      EST,
      new Date('2026-06-20T00:00:00.000Z'),
      new Date('2026-06-21T00:00:00.000Z'),
    );
    expect(linhas.length).toBe(1);
    expect(linhas[0]!.automaticoMm).toBe(9.9);
    expect(linhas[0]!.manualMm).toBe(5.5);
  });
});

describe('leituras pluviométricas (mock) — listarPorEstacaoEPeriodo', () => {
  afterEach(() => {
    _resetLeiturasPluviometricasMock();
  });

  it('filtra por estação e janela inclusiva, ordena por momento crescente', async () => {
    await repo.upsertLote([
      leitura('2026-06-20T12:00:00.000Z'),
      leitura('2026-06-20T08:00:00.000Z'),
      leitura('2026-06-20T23:59:00.000Z'),
      leitura('2026-06-19T23:00:00.000Z'), // fora da janela
      leitura('2026-06-20T10:00:00.000Z', { estacaoId: OUTRA }), // outra estação
    ]);

    const linhas = await repo.listarPorEstacaoEPeriodo(
      EST,
      new Date('2026-06-20T00:00:00.000Z'),
      new Date('2026-06-20T23:59:00.000Z'),
    );

    expect(linhas.map((l) => l.momento.toISOString())).toEqual([
      '2026-06-20T08:00:00.000Z',
      '2026-06-20T12:00:00.000Z',
      '2026-06-20T23:59:00.000Z',
    ]);
  });

  it('retorna vazio quando não há leitura na janela', async () => {
    const linhas = await repo.listarPorEstacaoEPeriodo(
      EST,
      new Date('2030-01-01T00:00:00.000Z'),
      new Date('2030-01-02T00:00:00.000Z'),
    );
    expect(linhas).toEqual([]);
  });
});

describe('leituras-pluviometricas-repository.pg — regressão de schema', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/infrastructure/db/leituras-pluviometricas-repository.pg.ts'),
    'utf-8',
  );

  it('usa a tabela real da migration 0046', () => {
    expect(source).toMatch(/FROM\s+leituras_pluviometricas/);
    expect(source).toMatch(/INSERT\s+INTO\s+leituras_pluviometricas/);
  });

  it('upsert de lote casa com o UNIQUE (estacao_id, momento)', () => {
    expect(source).toMatch(/ON\s+CONFLICT\s+\(estacao_id,\s*momento\)\s+DO\s+UPDATE/);
  });
});
