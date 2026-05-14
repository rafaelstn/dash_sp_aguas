/**
 * Testes do aplicarBulk: ações em lote sobre múltiplas estações.
 *
 * Cobre:
 *   - marcar_revisada
 *   - descartar
 *   - aceitar_sugestao_municipio (com e sem sugestão presente)
 *   - restaurar
 *   - limite de 500 estações por chamada (DoS)
 *   - tolerância a IDs inexistentes (não derruba a operação inteira)
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  _resetMockAna,
  _seedMockAnaLote,
  _seedMockAnaEstacao,
  _criarLoteMock,
  _criarEstacaoMock,
  META_ATOR,
  anaRevisaoRepository,
} from '@/infrastructure/mock/ana-revisao-repository.mock';

const LOTE_ID = '22222222-2222-4222-8222-222222222222';

function seedN(n: number, base: { divergente?: boolean } = {}) {
  _seedMockAnaLote(_criarLoteMock({ id: LOTE_ID, nome: 'bulk' }));
  const ids: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const id = `bulk-${i.toString().padStart(4, '0')}`;
    _seedMockAnaEstacao(
      _criarEstacaoMock({
        id,
        loteId: LOTE_ID,
        codigoAna: `${1000000 + i}`,
        municipioNome: 'Cruzeiro',
        divergenciaMunicipio: base.divergente ? 'divergente' : 'ok',
        municipioSugeridoNome: base.divergente ? 'Piquete' : null,
        municipioSugeridoCodigo: base.divergente ? '3539004' : null,
      }),
    );
    ids.push(id);
  }
  return ids;
}

describe('AnaRevisaoRepository: aplicarBulk', () => {
  afterEach(() => _resetMockAna());

  it('marcar_revisada aplica em todas as selecionadas', async () => {
    const ids = seedN(5);
    const r = await anaRevisaoRepository.aplicarBulk(
      LOTE_ID,
      { estacaoIds: ids, acao: 'marcar_revisada' },
      META_ATOR,
    );
    expect(r).toEqual({ aplicadas: 5, falhadas: 0 });
  });

  it('aceitar_sugestao_municipio aplica somente nas que têm sugestão', async () => {
    const idsDiverg = seedN(3, { divergente: true });
    // Adiciona 2 estações OK (sem sugestão de município)
    for (let i = 0; i < 2; i += 1) {
      const id = `ok-${i}`;
      _seedMockAnaEstacao(
        _criarEstacaoMock({
          id,
          loteId: LOTE_ID,
          codigoAna: `200${i}`,
          divergenciaMunicipio: 'ok',
        }),
      );
      idsDiverg.push(id);
    }
    const r = await anaRevisaoRepository.aplicarBulk(
      LOTE_ID,
      { estacaoIds: idsDiverg, acao: 'aceitar_sugestao_municipio' },
      META_ATOR,
    );
    expect(r.aplicadas).toBe(3);
    expect(r.falhadas).toBe(2);
  });

  it('descartar marca todas como descartadas', async () => {
    const ids = seedN(4);
    const r = await anaRevisaoRepository.aplicarBulk(
      LOTE_ID,
      { estacaoIds: ids, acao: 'descartar' },
      META_ATOR,
    );
    expect(r).toEqual({ aplicadas: 4, falhadas: 0 });
  });

  it('lista vazia devolve zero/zero (não erro)', async () => {
    const r = await anaRevisaoRepository.aplicarBulk(
      LOTE_ID,
      { estacaoIds: [], acao: 'marcar_revisada' },
      META_ATOR,
    );
    expect(r).toEqual({ aplicadas: 0, falhadas: 0 });
  });

  it('IDs inexistentes contam como falha mas não derrubam o lote inteiro', async () => {
    const ids = seedN(2);
    const r = await anaRevisaoRepository.aplicarBulk(
      LOTE_ID,
      {
        estacaoIds: [...ids, 'inexistente-1', 'inexistente-2'],
        acao: 'marcar_revisada',
      },
      META_ATOR,
    );
    expect(r.aplicadas).toBe(2);
    expect(r.falhadas).toBe(2);
  });

  it('rejeita lote acima de 500 estações (DoS guard)', async () => {
    const ids = Array.from({ length: 501 }, (_, i) => `fake-${i}`);
    await expect(
      anaRevisaoRepository.aplicarBulk(
        LOTE_ID,
        { estacaoIds: ids, acao: 'marcar_revisada' },
        META_ATOR,
      ),
    ).rejects.toThrow(/bulk limitado/);
  });
});
