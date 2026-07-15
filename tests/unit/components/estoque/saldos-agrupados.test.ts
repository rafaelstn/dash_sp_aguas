import { describe, it, expect } from 'vitest';
import { agruparSaldos, somarQuantidades } from '@/components/features/estoque/saldos-agrupados';
import type { SaldoContextoDTO } from '@/components/features/estoque/dtos';

function saldo(over: Partial<SaldoContextoDTO>): SaldoContextoDTO {
  return {
    id: over.id ?? Math.random().toString(36).slice(2),
    materialId: 'm1',
    localId: 'l1',
    quantidade: 1,
    tamanho: null,
    atualizadoEm: '2026-07-15T00:00:00.000Z',
    materialDescricao: 'Cabo',
    localRotulo: 'PENHA / SALA 1',
    unidade: 'PENHA',
    ...over,
  };
}

describe('agruparSaldos', () => {
  it('agrupa por material, soma total e conta locais distintos', () => {
    const grupos = agruparSaldos([
      saldo({ materialId: 'm1', localId: 'l1', quantidade: 10, localRotulo: 'B' }),
      saldo({ materialId: 'm1', localId: 'l2', quantidade: 5, localRotulo: 'A' }),
      saldo({ materialId: 'm2', localId: 'l1', quantidade: 3, materialDescricao: 'Antena' }),
    ]);

    expect(grupos).toHaveLength(2);
    // ordenado por descricao pt-BR: Antena antes de Cabo
    expect(grupos[0]!.descricao).toBe('Antena');
    const cabo = grupos.find((g) => g.materialId === 'm1')!;
    expect(cabo.total).toBe(15);
    expect(cabo.totalLocais).toBe(2);
    // linhas ordenadas por rotulo: A antes de B
    expect(cabo.linhas[0]!.localRotulo).toBe('A');
  });

  it('lista vazia retorna array vazio', () => {
    expect(agruparSaldos([])).toEqual([]);
  });

  it('sem resolver, marca e modelo ficam nulos (comportamento antigo)', () => {
    const [g] = agruparSaldos([saldo({ materialId: 'm1' })]);
    expect(g!.marca).toBeNull();
    expect(g!.modelo).toBeNull();
  });

  it('resolver anexa marca e modelo do catalogo para diferenciar homonimos', () => {
    const catalogo: Record<string, { marca: string | null; modelo: string | null }> = {
      m1: { marca: 'HOBECO', modelo: 'QUADRADA' },
      m2: { marca: 'harsh', modelo: null },
    };
    const grupos = agruparSaldos(
      [
        saldo({ materialId: 'm1', materialDescricao: 'Antenas' }),
        saldo({ materialId: 'm2', materialDescricao: 'Antenas' }),
      ],
      (id) => catalogo[id],
    );

    const m1 = grupos.find((g) => g.materialId === 'm1')!;
    const m2 = grupos.find((g) => g.materialId === 'm2')!;
    expect(m1.descricao).toBe('Antenas');
    expect(m1.marca).toBe('HOBECO');
    expect(m1.modelo).toBe('QUADRADA');
    // modelo ausente no catalogo permanece nulo (omitido graciosamente na UI)
    expect(m2.marca).toBe('harsh');
    expect(m2.modelo).toBeNull();
  });

  it('material fora do catalogo (resolver retorna undefined) mantem nulos', () => {
    const [g] = agruparSaldos([saldo({ materialId: 'mX' })], () => undefined);
    expect(g!.marca).toBeNull();
    expect(g!.modelo).toBeNull();
  });
});

describe('somarQuantidades', () => {
  it('soma todas as quantidades', () => {
    expect(somarQuantidades([saldo({ quantidade: 2 }), saldo({ quantidade: 8 })])).toBe(10);
    expect(somarQuantidades([])).toBe(0);
  });
});
