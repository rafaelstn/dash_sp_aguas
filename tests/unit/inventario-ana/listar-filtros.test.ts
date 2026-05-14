/**
 * Testes dos filtros do listar() e do isolamento por lote_id.
 *
 * Vetor de IDOR cross-lote: garante que `listar` e `obterPorCodigo`
 * NUNCA devolvem estações de outro lote, mesmo que o código exista
 * em ambos.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  _resetMockAna,
  _seedMockAnaLote,
  _seedMockAnaEstacao,
  _criarLoteMock,
  _criarEstacaoMock,
  anaRevisaoRepository,
} from '@/infrastructure/mock/ana-revisao-repository.mock';

const LOTE_A = '33333333-3333-4333-8333-333333333333';
const LOTE_B = '44444444-4444-4444-8444-444444444444';

describe('AnaRevisaoRepository: filtros + isolamento por lote', () => {
  afterEach(() => _resetMockAna());

  it('listar respeita filtro operando=sim', async () => {
    _seedMockAnaLote(_criarLoteMock({ id: LOTE_A, nome: 'A' }));
    _seedMockAnaEstacao(_criarEstacaoMock({ id: 'a1', loteId: LOTE_A, codigoAna: '1', operando: true, observacoes: ['x'] }));
    _seedMockAnaEstacao(_criarEstacaoMock({ id: 'a2', loteId: LOTE_A, codigoAna: '2', operando: false, observacoes: ['x'] }));
    _seedMockAnaEstacao(_criarEstacaoMock({ id: 'a3', loteId: LOTE_A, codigoAna: '3', operando: true, observacoes: ['x'] }));

    const r = await anaRevisaoRepository.listar(LOTE_A, { operando: 'sim' });
    expect(r.total).toBe(2);
    expect(r.itens.every((e) => e.operando === true)).toBe(true);
  });

  it('listar respeita filtro divergencia=divergente', async () => {
    _seedMockAnaLote(_criarLoteMock({ id: LOTE_A, nome: 'A' }));
    _seedMockAnaEstacao(_criarEstacaoMock({ id: '1', loteId: LOTE_A, codigoAna: '1', divergenciaMunicipio: 'divergente' }));
    _seedMockAnaEstacao(_criarEstacaoMock({ id: '2', loteId: LOTE_A, codigoAna: '2', divergenciaMunicipio: 'ok' }));
    _seedMockAnaEstacao(_criarEstacaoMock({ id: '3', loteId: LOTE_A, codigoAna: '3', divergenciaMunicipio: 'margem_aceitavel' }));

    const r = await anaRevisaoRepository.listar(LOTE_A, { divergenciaMunicipio: 'divergente' });
    expect(r.total).toBe(1);
    expect(r.itens[0]!.codigoAna).toBe('1');
  });

  it('listar com busca por código ANA case-insensitive', async () => {
    _seedMockAnaLote(_criarLoteMock({ id: LOTE_A, nome: 'A' }));
    _seedMockAnaEstacao(_criarEstacaoMock({ id: '1', loteId: LOTE_A, codigoAna: '1949001', nome: 'RIOLANDIA' }));
    _seedMockAnaEstacao(_criarEstacaoMock({ id: '2', loteId: LOTE_A, codigoAna: '1950001', nome: 'OUTRA' }));

    const r = await anaRevisaoRepository.listar(LOTE_A, { busca: '1949' });
    expect(r.total).toBe(1);
    expect(r.itens[0]!.codigoAna).toBe('1949001');
  });

  it('listar respeita semMatch=true (sem posto_id)', async () => {
    _seedMockAnaLote(_criarLoteMock({ id: LOTE_A, nome: 'A' }));
    _seedMockAnaEstacao(_criarEstacaoMock({ id: '1', loteId: LOTE_A, codigoAna: '1', postoId: 'p1' }));
    _seedMockAnaEstacao(_criarEstacaoMock({ id: '2', loteId: LOTE_A, codigoAna: '2', postoId: null }));

    const r = await anaRevisaoRepository.listar(LOTE_A, { semMatch: true });
    expect(r.total).toBe(1);
    expect(r.itens[0]!.codigoAna).toBe('2');
  });

  it('paginação respeita porPagina e pagina', async () => {
    _seedMockAnaLote(_criarLoteMock({ id: LOTE_A, nome: 'A' }));
    for (let i = 0; i < 50; i += 1) {
      _seedMockAnaEstacao(
        _criarEstacaoMock({
          id: `id-${i}`,
          loteId: LOTE_A,
          codigoAna: `${1000 + i}`,
        }),
      );
    }
    const p1 = await anaRevisaoRepository.listar(LOTE_A, { pagina: 1, porPagina: 20 });
    const p2 = await anaRevisaoRepository.listar(LOTE_A, { pagina: 2, porPagina: 20 });
    expect(p1.total).toBe(50);
    expect(p1.itens.length).toBe(20);
    expect(p2.itens.length).toBe(20);
    // Páginas não se sobrepõem
    const idsP1 = new Set(p1.itens.map((i) => i.id));
    const idsP2 = new Set(p2.itens.map((i) => i.id));
    for (const id of idsP2) expect(idsP1.has(id)).toBe(false);
  });

  it('isolamento lote: listar(LOTE_A) NUNCA devolve estações do LOTE_B (anti-IDOR)', async () => {
    _seedMockAnaLote(_criarLoteMock({ id: LOTE_A, nome: 'A' }));
    _seedMockAnaLote(_criarLoteMock({ id: LOTE_B, nome: 'B' }));
    // Mesmo código ANA em dois lotes (caso real: ciclo PROGESTÃO atual + anterior)
    _seedMockAnaEstacao(_criarEstacaoMock({ id: 'a1', loteId: LOTE_A, codigoAna: '1949001', nome: 'A' }));
    _seedMockAnaEstacao(_criarEstacaoMock({ id: 'b1', loteId: LOTE_B, codigoAna: '1949001', nome: 'B' }));

    const rA = await anaRevisaoRepository.listar(LOTE_A, {});
    const rB = await anaRevisaoRepository.listar(LOTE_B, {});

    expect(rA.itens).toHaveLength(1);
    expect(rA.itens[0]!.nome).toBe('A');
    expect(rB.itens).toHaveLength(1);
    expect(rB.itens[0]!.nome).toBe('B');
  });

  it('isolamento lote: obterPorCodigo(LOTE_A, codigo) NUNCA devolve de outro lote', async () => {
    _seedMockAnaLote(_criarLoteMock({ id: LOTE_A, nome: 'A' }));
    _seedMockAnaLote(_criarLoteMock({ id: LOTE_B, nome: 'B' }));
    _seedMockAnaEstacao(_criarEstacaoMock({ id: 'b1', loteId: LOTE_B, codigoAna: '1949001', nome: 'B' }));

    // Código existe no LOTE_B mas não no LOTE_A → não pode vazar
    const rA = await anaRevisaoRepository.obterPorCodigo(LOTE_A, '1949001');
    expect(rA).toBeNull();

    const rB = await anaRevisaoRepository.obterPorCodigo(LOTE_B, '1949001');
    expect(rB?.nome).toBe('B');
  });
});
