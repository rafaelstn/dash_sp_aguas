import { describe, it, expect } from 'vitest';
import { ITENS_POR_LOTE } from '@/app/api/estoque/conferencias/_schemas';
import type { ConferenciaItemDTO } from '@/components/features/estoque/conferencia-dtos';
import {
  TAMANHO_ONDA_LOTE,
  agregarLotes,
  autoriaDoItem,
  avisoOutraUnidadeFisica,
  descreverAjuste,
  dividirEmOndas,
  descreverBaseAlterada,
  divergenciaDoItem,
  idsElegiveisLote,
  itemContado,
  itemReconciliado,
  montarContagemQuantidade,
  montarContagemSerializado,
  naturezaDoItem,
  progressoContagem,
  resumirLote,
  separarLocaisParaContagem,
} from '@/components/features/estoque/conferencia-ui';

const LOCAL_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const LOCAL_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const UNIDADE = '11111111-1111-1111-1111-111111111111';
const MATERIAL = '22222222-2222-2222-2222-222222222222';

const NOMES: Record<string, string> = { [LOCAL_A]: 'Sala A', [LOCAL_B]: 'Sala B' };
const nomeLocal = (id: string | null) => (id ? (NOMES[id] ?? '—') : '—');

function itemBase(over: Partial<ConferenciaItemDTO>): ConferenciaItemDTO {
  return {
    id: 'item-1',
    conferenciaId: 'conf-1',
    unidadeId: null,
    materialId: null,
    localEsperadoId: LOCAL_A,
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
    criadoEm: '2026-07-15T10:00:00Z',
    atualizadoEm: '2026-07-15T10:00:00Z',
    ...over,
  };
}

function serial(over: Partial<ConferenciaItemDTO>): ConferenciaItemDTO {
  return itemBase({ unidadeId: UNIDADE, situacao: 'pendente', ...over });
}

function quant(over: Partial<ConferenciaItemDTO>): ConferenciaItemDTO {
  return itemBase({ materialId: MATERIAL, quantidadeSistema: 10, ...over });
}

describe('naturezaDoItem', () => {
  it('serializado tem unidade; quantificavel tem material', () => {
    expect(naturezaDoItem(serial({}))).toBe('serializado');
    expect(naturezaDoItem(quant({}))).toBe('quantificavel');
  });
});

describe('itemContado', () => {
  it('serializado: pendente nao contado, demais contados', () => {
    expect(itemContado(serial({ situacao: 'pendente' }))).toBe(false);
    expect(itemContado(serial({ situacao: 'conferido' }))).toBe(true);
    expect(itemContado(serial({ situacao: 'nao_encontrado' }))).toBe(true);
  });
  it('quantificavel: contado quando quantidade preenchida (inclusive zero)', () => {
    expect(itemContado(quant({ quantidadeContada: null }))).toBe(false);
    expect(itemContado(quant({ quantidadeContada: 0, diferenca: -10 }))).toBe(true);
  });
});

describe('divergenciaDoItem', () => {
  it('quantificavel: sobra, falta e sem divergencia', () => {
    expect(divergenciaDoItem(quant({ quantidadeContada: 12, diferenca: 2 }))).toMatchObject({
      divergente: true,
      tipo: 'sobra',
      diferenca: 2,
    });
    expect(divergenciaDoItem(quant({ quantidadeContada: 8, diferenca: -2 }))).toMatchObject({
      divergente: true,
      tipo: 'falta',
      diferenca: -2,
    });
    expect(divergenciaDoItem(quant({ quantidadeContada: 10, diferenca: 0 }))).toMatchObject({
      divergente: false,
      diferenca: 0,
    });
  });
  it('quantificavel: usa contada - sistema quando diferenca vem null', () => {
    expect(divergenciaDoItem(quant({ quantidadeContada: 7, diferenca: null }))).toMatchObject({
      divergente: true,
      tipo: 'falta',
      diferenca: -3,
    });
  });
  it('quantificavel nao contado nao e divergente', () => {
    expect(divergenciaDoItem(quant({ quantidadeContada: null })).divergente).toBe(false);
  });
  it('serializado: categorico por situacao', () => {
    expect(divergenciaDoItem(serial({ situacao: 'conferido' })).divergente).toBe(false);
    expect(divergenciaDoItem(serial({ situacao: 'nao_encontrado' })).tipo).toBe('nao_encontrado');
    expect(divergenciaDoItem(serial({ situacao: 'encontrado_em_outro_local' })).tipo).toBe(
      'outro_local',
    );
  });
});

describe('descreverAjuste', () => {
  it('quantificavel sobra -> entrada no local esperado', () => {
    const a = descreverAjuste(quant({ quantidadeContada: 13, diferenca: 3 }), nomeLocal);
    expect(a).toMatchObject({ tipo: 'entrada', quantidade: 3, semMovimentacao: false });
    expect(a.texto).toContain('Entrada de 3');
    expect(a.texto).toContain('Sala A');
  });
  it('quantificavel falta -> saida (quantidade absoluta)', () => {
    const a = descreverAjuste(quant({ quantidadeContada: 6, diferenca: -4 }), nomeLocal);
    expect(a).toMatchObject({ tipo: 'saida', quantidade: 4 });
    expect(a.texto).toContain('Saída de 4');
  });
  it('serializado em outro local -> transferencia esperado -> encontrado', () => {
    const a = descreverAjuste(
      serial({ situacao: 'encontrado_em_outro_local', localEncontradoId: LOCAL_B }),
      nomeLocal,
    );
    expect(a).toMatchObject({ tipo: 'transferencia', semMovimentacao: false });
    expect(a.texto).toContain('Sala A');
    expect(a.texto).toContain('Sala B');
  });
  it('serializado nao encontrado -> apuracao, sem movimentacao', () => {
    const a = descreverAjuste(serial({ situacao: 'nao_encontrado' }), nomeLocal);
    expect(a).toMatchObject({ tipo: 'apuracao', semMovimentacao: true, quantidade: null });
  });
  it('sem divergencia -> nenhum ajuste', () => {
    expect(descreverAjuste(serial({ situacao: 'conferido' }), nomeLocal).tipo).toBe('nenhum');
    expect(descreverAjuste(quant({ quantidadeContada: 10, diferenca: 0 }), nomeLocal).tipo).toBe(
      'nenhum',
    );
  });
});

describe('montarContagemSerializado', () => {
  it('conferido e nao_encontrado montam sem local', () => {
    expect(montarContagemSerializado('conferido', null).payload).toEqual({ situacao: 'conferido' });
    expect(montarContagemSerializado('nao_encontrado', null).payload).toEqual({
      situacao: 'nao_encontrado',
    });
  });
  it('encontrado_em_outro_local exige o local encontrado', () => {
    const semLocal = montarContagemSerializado('encontrado_em_outro_local', null);
    expect(semLocal.payload).toBeNull();
    expect(semLocal.erro).toMatch(/local/i);
    const comLocal = montarContagemSerializado('encontrado_em_outro_local', LOCAL_B);
    expect(comLocal.payload).toEqual({
      situacao: 'encontrado_em_outro_local',
      localEncontradoId: LOCAL_B,
    });
  });
  it('anexa observacao aparada quando informada', () => {
    expect(montarContagemSerializado('conferido', null, '  ok  ').payload).toEqual({
      situacao: 'conferido',
      observacao: 'ok',
    });
  });
});

describe('montarContagemQuantidade', () => {
  it('aceita zero e inteiros positivos', () => {
    expect(montarContagemQuantidade(0).payload).toEqual({ quantidadeContada: 0 });
    expect(montarContagemQuantidade(15).payload).toEqual({ quantidadeContada: 15 });
  });
  it('rejeita negativo e nao inteiro', () => {
    expect(montarContagemQuantidade(-1).payload).toBeNull();
    expect(montarContagemQuantidade(2.5).payload).toBeNull();
    expect(montarContagemQuantidade(Number.NaN).payload).toBeNull();
  });
});

describe('resumirLote e idsElegiveisLote', () => {
  const itens: ConferenciaItemDTO[] = [
    quant({ id: 'q-sobra', quantidadeContada: 12, diferenca: 2 }),
    quant({ id: 'q-falta', quantidadeContada: 8, diferenca: -2 }),
    quant({ id: 'q-ok', quantidadeContada: 10, diferenca: 0 }),
    serial({ id: 's-outro', situacao: 'encontrado_em_outro_local', localEncontradoId: LOCAL_B }),
    serial({ id: 's-nao', situacao: 'nao_encontrado' }),
    serial({ id: 's-conf', situacao: 'conferido' }),
    quant({
      id: 'q-ja',
      quantidadeContada: 9,
      diferenca: -1,
      reconciliadoEm: '2026-07-15T11:00:00Z',
      reconciliadoPor: 'user-1',
    }),
  ];

  it('conta por tipo somente divergentes nao reconciliados', () => {
    const r = resumirLote(itens, nomeLocal);
    expect(r).toEqual({ total: 4, entradas: 1, saidas: 1, transferencias: 1, apuracoes: 1 });
  });
  it('idsElegiveisLote ignora ok, conferido e ja reconciliado', () => {
    expect(idsElegiveisLote(itens).sort()).toEqual(
      ['q-sobra', 'q-falta', 's-outro', 's-nao'].sort(),
    );
  });
});

describe('itemReconciliado e progressoContagem', () => {
  it('reconciliado quando ha carimbo', () => {
    expect(itemReconciliado(quant({ reconciliadoEm: null }))).toBe(false);
    expect(itemReconciliado(quant({ reconciliadoEm: '2026-07-15T11:00:00Z' }))).toBe(true);
  });
  it('progresso calcula percentual inteiro e trata total zero', () => {
    expect(progressoContagem(5, 20)).toMatchObject({ pct: 25 });
    expect(progressoContagem(0, 0).pct).toBe(0);
    expect(progressoContagem(3, 3).pct).toBe(100);
  });
});

describe('descreverBaseAlterada (aviso antes de confirmar)', () => {
  it('base estavel nao gera aviso', () => {
    expect(
      descreverBaseAlterada(
        quant({ quantidadeSistema: 10, quantidadeContada: 12, saldoAtual: 10 }),
        nomeLocal,
      ),
    ).toBeNull();
  });

  it('quantificavel: mostra o congelado e o atual', () => {
    const texto = descreverBaseAlterada(
      quant({ quantidadeSistema: 10, quantidadeContada: 12, saldoAtual: 15 }),
      nomeLocal,
    );
    expect(texto).toContain('registrava 10');
    expect(texto).toContain('registra 15');
  });

  it('serializado: unidade movida durante a contagem aponta os dois locais', () => {
    const texto = descreverBaseAlterada(
      serial({
        situacao: 'encontrado_em_outro_local',
        localEsperadoId: LOCAL_A,
        localEncontradoId: LOCAL_B,
        localAtualId: LOCAL_B,
        statusAtual: 'ativo',
      }),
      nomeLocal,
    );
    expect(texto).toContain('Sala A');
    expect(texto).toContain('Sala B');
  });

  it('serializado fora de operacao avisa a baixa, que tem precedencia', () => {
    const texto = descreverBaseAlterada(
      serial({
        situacao: 'encontrado_em_outro_local',
        localEsperadoId: LOCAL_A,
        localAtualId: null,
        statusAtual: 'descarte',
      }),
      nomeLocal,
    );
    expect(texto).toContain('saiu de operação');
    expect(texto).toContain('descarte');
  });

  it('sem estado atual carregado, nao inventa aviso', () => {
    expect(
      descreverBaseAlterada(quant({ quantidadeSistema: 10, quantidadeContada: 12 }), nomeLocal),
    ).toBeNull();
  });
});

describe('autoriaDoItem (trilha da contagem)', () => {
  it('item nao contado nao inventa autoria', () => {
    expect(autoriaDoItem(quant({ quantidadeContada: null }))).toBe('Ainda não contado');
  });

  it('usa o rotulo resolvido pela API, nunca o UUID cru', () => {
    const texto = autoriaDoItem(
      quant({
        quantidadeContada: 8,
        contadoPor: '33333333-3333-3333-3333-333333333333',
        contadoPorRotulo: 'Maria Souza',
        contadoEm: '2026-07-15T14:30:00Z',
      }),
    );
    expect(texto).toContain('Contado por Maria Souza');
    expect(texto).not.toContain('33333333');
  });

  it('item contado antes da migration 0065 admite a lacuna em vez de forjar autor', () => {
    expect(autoriaDoItem(quant({ quantidadeContada: 8, contadoPor: null }))).toBe(
      'Contado (autoria não registrada)',
    );
  });

  it('junta contagem e reconciliacao quando as duas existem', () => {
    const texto = autoriaDoItem(
      quant({
        quantidadeContada: 8,
        contadoPor: 'u1',
        contadoPorRotulo: 'Maria',
        contadoEm: '2026-07-15T14:30:00Z',
        reconciliadoPor: 'u2',
        reconciliadoPorRotulo: 'João',
        reconciliadoEm: '2026-07-16T09:00:00Z',
      }),
    );
    expect(texto).toContain('Contado por Maria');
    expect(texto).toContain('Reconciliado por João');
  });
});

describe('ondas do lote de reconciliacao', () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `id-${i}`);

  it('conjunto menor que o teto vira uma onda so', () => {
    expect(dividirEmOndas(ids(30))).toEqual([ids(30)]);
  });

  it('divide no teto do servidor sem perder nem repetir id', () => {
    const ondas = dividirEmOndas(ids(250));
    expect(ondas.map((o) => o.length)).toEqual([100, 100, 50]);
    expect(ondas.flat()).toEqual(ids(250));
    expect(new Set(ondas.flat()).size).toBe(250);
  });

  it('nenhuma onda excede o teto que a rota aceita', () => {
    for (const onda of dividirEmOndas(ids(1000))) {
      expect(onda.length).toBeLessThanOrEqual(TAMANHO_ONDA_LOTE);
    }
  });

  it('conjunto vazio nao gera requisicao', () => {
    expect(dividirEmOndas([])).toEqual([]);
  });

  // Se as duas constantes divergirem, a UI monta uma onda que a rota recusa com
  // 400 e o operador ve "erro" no meio do lote.
  it('o teto da UI e o mesmo que a rota aceita', () => {
    expect(TAMANHO_ONDA_LOTE).toBe(ITENS_POR_LOTE);
  });

  it('agrega as ondas somando os contadores e preservando a ordem dos itens', () => {
    const agregado = agregarLotes('conf-1', [
      {
        conferenciaId: 'conf-1',
        total: 2,
        reconciliados: 2,
        falhas: 0,
        itens: [
          { itemId: 'a', sucesso: true },
          { itemId: 'b', sucesso: true },
        ],
      },
      {
        conferenciaId: 'conf-1',
        total: 2,
        reconciliados: 1,
        falhas: 1,
        itens: [
          { itemId: 'c', sucesso: true },
          { itemId: 'd', sucesso: false, erro: 'SaldoInsuficiente' },
        ],
      },
    ]);
    expect(agregado).toMatchObject({ total: 4, reconciliados: 3, falhas: 1 });
    expect(agregado.itens.map((i) => i.itemId)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('interrupcao no meio agrega so o que foi aplicado (o parcial e real)', () => {
    const parcial = agregarLotes('conf-1', [
      { conferenciaId: 'conf-1', total: 100, reconciliados: 100, falhas: 0, itens: [] },
    ]);
    expect(parcial.reconciliados).toBe(100);
    expect(parcial.total).toBe(100);
  });
});

describe('locais oferecidos na contagem do serializado', () => {
  const LOCAIS = [
    { id: LOCAL_A, unidade: 'PENHA', rotulo: 'Sala A' },
    { id: LOCAL_B, unidade: 'PENHA', rotulo: 'Sala B' },
    { id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', unidade: 'ARARAQUARA', rotulo: 'Depósito' },
  ];

  it('nao oferece o local esperado (transferencia de A para A o ledger recusa)', () => {
    const r = separarLocaisParaContagem(LOCAIS, 'PENHA', LOCAL_A);
    expect(r.nesta.map((l) => l.id)).toEqual([LOCAL_B]);
  });

  it('oferece tambem os locais de outra unidade fisica, separados', () => {
    const r = separarLocaisParaContagem(LOCAIS, 'PENHA', null);
    expect(r.nesta).toHaveLength(2);
    expect(r.outras.map((l) => l.rotulo)).toEqual(['Depósito']);
  });

  it('sessao da outra unidade inverte os grupos', () => {
    const r = separarLocaisParaContagem(LOCAIS, 'ARARAQUARA', null);
    expect(r.nesta.map((l) => l.rotulo)).toEqual(['Depósito']);
    expect(r.outras).toHaveLength(2);
  });

  it('avisa quando o local escolhido fica em outra unidade fisica', () => {
    const aviso = avisoOutraUnidadeFisica(
      LOCAIS,
      'PENHA',
      'cccccccc-cccc-cccc-cccc-cccccccccccc',
    );
    expect(aviso).toContain('ARARAQUARA');
    expect(aviso).toContain('transferir');
  });

  it('nao avisa em transferencia interna nem para local desconhecido', () => {
    expect(avisoOutraUnidadeFisica(LOCAIS, 'PENHA', LOCAL_B)).toBeNull();
    expect(avisoOutraUnidadeFisica(LOCAIS, 'PENHA', 'inexistente')).toBeNull();
  });
});
