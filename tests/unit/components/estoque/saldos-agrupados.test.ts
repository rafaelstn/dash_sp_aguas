import { describe, it, expect } from 'vitest';
import {
  agruparSaldos,
  contarAbaixoDoMinimo,
  filtrarAbaixoDoMinimo,
  somarQuantidades,
} from '@/components/features/estoque/saldos-agrupados';
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

  it('sem resolver, quantidade minima nula e nunca fica abaixo do minimo', () => {
    const [g] = agruparSaldos([saldo({ materialId: 'm1', quantidade: 0 })]);
    expect(g!.quantidadeMinima).toBeNull();
    expect(g!.abaixoDoMinimo).toBe(false);
  });

  it('resolver traz a quantidade minima e marca abaixo com o total SOMADO', () => {
    // Duas linhas do mesmo material: total 4 (3 + 1), minimo 5 -> abaixo.
    const grupos = agruparSaldos(
      [
        saldo({ materialId: 'm1', localId: 'l1', quantidade: 3, localRotulo: 'A' }),
        saldo({ materialId: 'm1', localId: 'l2', quantidade: 1, localRotulo: 'B' }),
      ],
      () => ({ marca: null, modelo: null, quantidadeMinima: 5 }),
    );
    expect(grupos[0]!.total).toBe(4);
    expect(grupos[0]!.quantidadeMinima).toBe(5);
    expect(grupos[0]!.abaixoDoMinimo).toBe(true);
  });

  it('total igual ao minimo NAO fica abaixo (o minimo e o piso aceitavel)', () => {
    const [g] = agruparSaldos([saldo({ materialId: 'm1', quantidade: 10 })], () => ({
      marca: null,
      modelo: null,
      quantidadeMinima: 10,
    }));
    expect(g!.abaixoDoMinimo).toBe(false);
  });
});

describe('contarAbaixoDoMinimo / filtrarAbaixoDoMinimo', () => {
  // Catalogo: m1 abaixo (total 1 < min 5), m2 ok (total 20 >= min 5), m3 sem minimo.
  const catalogo: Record<string, { marca: null; modelo: null; quantidadeMinima: number | null }> =
    {
      m1: { marca: null, modelo: null, quantidadeMinima: 5 },
      m2: { marca: null, modelo: null, quantidadeMinima: 5 },
      m3: { marca: null, modelo: null, quantidadeMinima: null },
    };
  const grupos = agruparSaldos(
    [
      saldo({ materialId: 'm1', quantidade: 1, materialDescricao: 'Cabo' }),
      saldo({ materialId: 'm2', quantidade: 20, materialDescricao: 'Antena' }),
      saldo({ materialId: 'm3', quantidade: 0, materialDescricao: 'Bucha' }),
    ],
    (id) => catalogo[id],
  );

  it('conta apenas os materiais abaixo do minimo', () => {
    expect(contarAbaixoDoMinimo(grupos)).toBe(1);
  });

  it('filtra mantendo so os abaixo do minimo', () => {
    const abaixo = filtrarAbaixoDoMinimo(grupos);
    expect(abaixo).toHaveLength(1);
    expect(abaixo[0]!.materialId).toBe('m1');
  });

  it('conjunto vazio: zero e lista vazia', () => {
    expect(contarAbaixoDoMinimo([])).toBe(0);
    expect(filtrarAbaixoDoMinimo([])).toEqual([]);
  });
});

describe('somarQuantidades', () => {
  it('soma todas as quantidades', () => {
    expect(somarQuantidades([saldo({ quantidade: 2 }), saldo({ quantidade: 8 })])).toBe(10);
    expect(somarQuantidades([])).toBe(0);
  });
});
