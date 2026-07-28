import { describe, expect, it } from 'vitest';
import {
  calcularDivergencia,
  motivoReconciliacao,
  resolverReconciliacao,
  statusConferenciaValido,
  type ConferenciaItem,
} from '@/domain/estoque/conferencia';

/** Factory de item com defaults; sobrescreve o que o teste precisa. */
function item(over: Partial<ConferenciaItem>): ConferenciaItem {
  const base: ConferenciaItem = {
    id: 'i1',
    conferenciaId: 'cafe1234-0000-0000-0000-000000000000',
    unidadeId: null,
    materialId: null,
    localEsperadoId: null,
    tamanho: null,
    origem: 'snapshot',
    situacao: null,
    localEncontradoId: null,
    quantidadeSistema: null,
    quantidadeContada: null,
    diferenca: null,
    observacao: null,
    contadoPor: null,
    contadoEm: null,
    movimentacaoId: null,
    reconciliadoPor: null,
    reconciliadoEm: null,
    criadoEm: new Date(),
    atualizadoEm: new Date(),
  };
  return { ...base, ...over };
}

describe('conferencia, maquina de estados da sessao', () => {
  it('aberta transiciona para concluida e cancelada; terminais nao voltam', () => {
    expect(statusConferenciaValido('aberta', 'concluida')).toBe(true);
    expect(statusConferenciaValido('aberta', 'cancelada')).toBe(true);
    expect(statusConferenciaValido('concluida', 'aberta')).toBe(false);
    expect(statusConferenciaValido('cancelada', 'aberta')).toBe(false);
    expect(statusConferenciaValido('aberta', 'aberta')).toBe(false);
  });
});

// A contagem do serializado nao tem funcao de transicao propria: as guardas sao o
// enum do schema (nao aceita `pendente`) e a exigencia de sessao aberta, ambas
// cobertas nos testes de use-case. O `situacaoContagemValida` que existia aqui era
// codigo morto descrito no doc como guarda ativa; removido junto com este bloco.

describe('conferencia, calcularDivergencia (quantificavel)', () => {
  it('nao contado ainda nao e divergencia', () => {
    const d = calcularDivergencia(item({ materialId: 'm1', quantidadeSistema: 5 }));
    expect(d).toEqual({ divergente: false, tipo: 'nao_contado', diferenca: null });
  });
  it('contada > sistema = sobra (diferenca positiva)', () => {
    const d = calcularDivergencia(
      item({ materialId: 'm1', quantidadeSistema: 5, quantidadeContada: 8, diferenca: 3 }),
    );
    expect(d).toEqual({ divergente: true, tipo: 'sobra', diferenca: 3 });
  });
  it('contada < sistema = falta (diferenca negativa)', () => {
    const d = calcularDivergencia(
      item({ materialId: 'm1', quantidadeSistema: 5, quantidadeContada: 2, diferenca: -3 }),
    );
    expect(d).toEqual({ divergente: true, tipo: 'falta', diferenca: -3 });
  });
  it('contada = sistema = sem divergencia', () => {
    const d = calcularDivergencia(
      item({ materialId: 'm1', quantidadeSistema: 5, quantidadeContada: 5, diferenca: 0 }),
    );
    expect(d.divergente).toBe(false);
    expect(d.tipo).toBe('nenhuma');
  });
});

describe('conferencia, calcularDivergencia (serializado)', () => {
  it('conferido e pendente nao divergem; nao_encontrado e outro_local divergem', () => {
    expect(calcularDivergencia(item({ unidadeId: 'u1', situacao: 'conferido' })).divergente).toBe(false);
    expect(calcularDivergencia(item({ unidadeId: 'u1', situacao: 'pendente' })).divergente).toBe(false);
    expect(calcularDivergencia(item({ unidadeId: 'u1', situacao: 'nao_encontrado' })).tipo).toBe(
      'nao_encontrado',
    );
    expect(
      calcularDivergencia(item({ unidadeId: 'u1', situacao: 'encontrado_em_outro_local' })).tipo,
    ).toBe('outro_local');
  });
});

describe('conferencia, resolverReconciliacao (mapeamento divergencia -> movimentacao)', () => {
  it('quantificavel sobra -> entrada da diferenca no local esperado', () => {
    const cmd = resolverReconciliacao(
      item({
        materialId: 'm1',
        localEsperadoId: 'L1',
        tamanho: '2.5mm',
        quantidadeSistema: 5,
        quantidadeContada: 8,
        diferenca: 3,
      }),
    );
    expect(cmd).toMatchObject({
      tipo: 'entrada',
      alvo: { natureza: 'quantificavel', materialId: 'm1' },
      quantidade: 3,
      localDestinoId: 'L1',
      localOrigemId: null,
      tamanho: '2.5mm',
    });
  });

  it('quantificavel falta -> saida do modulo da diferenca do local esperado', () => {
    const cmd = resolverReconciliacao(
      item({
        materialId: 'm1',
        localEsperadoId: 'L1',
        quantidadeSistema: 5,
        quantidadeContada: 2,
        diferenca: -3,
      }),
    );
    expect(cmd).toMatchObject({
      tipo: 'saida',
      quantidade: 3,
      localOrigemId: 'L1',
      localDestinoId: null,
    });
  });

  it('quantificavel diferenca 0 -> null (so carimba)', () => {
    expect(
      resolverReconciliacao(
        item({ materialId: 'm1', quantidadeSistema: 5, quantidadeContada: 5, diferenca: 0 }),
      ),
    ).toBeNull();
  });

  it('serializado encontrado_em_outro_local -> transferencia esperado->encontrado', () => {
    const cmd = resolverReconciliacao(
      item({
        unidadeId: 'u1',
        situacao: 'encontrado_em_outro_local',
        localEsperadoId: 'L1',
        localEncontradoId: 'L2',
      }),
    );
    expect(cmd).toMatchObject({
      tipo: 'transferencia',
      alvo: { natureza: 'serializado', unidadeId: 'u1' },
      quantidade: 1,
      localOrigemId: 'L1',
      localDestinoId: 'L2',
    });
  });

  it('serializado conferido e nao_encontrado -> null (nao gera movimentacao automatica)', () => {
    expect(resolverReconciliacao(item({ unidadeId: 'u1', situacao: 'conferido' }))).toBeNull();
    expect(resolverReconciliacao(item({ unidadeId: 'u1', situacao: 'nao_encontrado' }))).toBeNull();
  });

  it('motivo carrega o id curto da conferencia', () => {
    const cmd = resolverReconciliacao(
      item({ materialId: 'm1', localEsperadoId: 'L1', quantidadeSistema: 0, quantidadeContada: 2, diferenca: 2 }),
    );
    expect(cmd?.motivo).toBe(motivoReconciliacao('cafe1234-0000-0000-0000-000000000000'));
    expect(cmd?.motivo).toContain('cafe1234');
  });
});
