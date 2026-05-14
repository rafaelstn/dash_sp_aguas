/**
 * Testes de transição de status do AnaRevisaoRepository (mock).
 *
 * Cobre as transições permitidas (definidas no pg + mock):
 *   pendente        → em_revisao, revisada, descartada, sem_match
 *   em_revisao      → revisada, descartada, pendente
 *   revisada        → em_revisao, descartada, promovida_a_posto
 *   descartada      → pendente, em_revisao
 *   sem_match       → em_revisao, descartada, promovida_a_posto
 *   promovida_a_posto → (nenhuma, terminal)
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  _resetMockAna,
  _seedMockAnaLote,
  _seedMockAnaEstacao,
  _criarLoteMock,
  _criarEstacaoMock,
  _eventosMockAna,
  META_ATOR,
  anaRevisaoRepository,
} from '@/infrastructure/mock/ana-revisao-repository.mock';
import type { StatusRevisao } from '@/domain/ana-revisao';

const LOTE_ID = '11111111-1111-4111-8111-111111111111';

function seed(status: StatusRevisao = 'pendente') {
  _seedMockAnaLote(_criarLoteMock({ id: LOTE_ID, nome: 'teste' }));
  const id = `${status}-${Math.random().toString(16).slice(2, 8)}`;
  const estacao = _criarEstacaoMock({
    id,
    loteId: LOTE_ID,
    codigoAna: id,
    status,
  });
  _seedMockAnaEstacao(estacao);
  return estacao;
}

describe('AnaRevisaoRepository: transições de status', () => {
  afterEach(() => _resetMockAna());

  it('pendente → revisada permitido (happy path)', async () => {
    const e = seed('pendente');
    const r = await anaRevisaoRepository.aplicarRevisao(
      e.id,
      { novoStatus: 'revisada' },
      META_ATOR,
    );
    expect(r.status).toBe('revisada');
    expect(r.revisadoEm).toBeTruthy();
  });

  it('pendente → em_revisao permitido', async () => {
    const e = seed('pendente');
    const r = await anaRevisaoRepository.aplicarRevisao(
      e.id,
      { novoStatus: 'em_revisao' },
      META_ATOR,
    );
    expect(r.status).toBe('em_revisao');
  });

  it('promovida_a_posto NÃO permite nenhuma transição (terminal)', async () => {
    const e = seed('promovida_a_posto');
    await expect(
      anaRevisaoRepository.aplicarRevisao(
        e.id,
        { novoStatus: 'pendente' },
        META_ATOR,
      ),
    ).rejects.toThrow(/transicao invalida/);
  });

  it('mesmo status (idempotência) é aceito', async () => {
    const e = seed('pendente');
    const r = await anaRevisaoRepository.aplicarRevisao(
      e.id,
      { novoStatus: 'pendente' },
      META_ATOR,
    );
    expect(r.status).toBe('pendente');
  });

  it('descartada pode voltar para pendente (correção de erro)', async () => {
    const e = seed('descartada');
    const r = await anaRevisaoRepository.aplicarRevisao(
      e.id,
      { novoStatus: 'pendente' },
      META_ATOR,
    );
    expect(r.status).toBe('pendente');
  });

  it('pendente → promovida_a_posto NÃO permitido (precisa passar por revisada/em_revisao)', async () => {
    const e = seed('pendente');
    await expect(
      anaRevisaoRepository.aplicarRevisao(
        e.id,
        { novoStatus: 'promovida_a_posto' },
        META_ATOR,
      ),
    ).rejects.toThrow(/transicao invalida/);
  });

  it('correção é mesclada (não sobrescreve)', async () => {
    const e = seed('pendente');
    // Primeira correção
    await anaRevisaoRepository.aplicarRevisao(
      e.id,
      {
        novoStatus: 'em_revisao',
        correcoes: { codigoAdicional: '3D-001' },
      },
      META_ATOR,
    );
    // Segunda correção (campo diferente)
    const r = await anaRevisaoRepository.aplicarRevisao(
      e.id,
      {
        novoStatus: 'revisada',
        correcoes: { municipioNome: 'Cruzeiro' },
      },
      META_ATOR,
    );
    expect(r.correcoes).toEqual({
      codigoAdicional: '3D-001',
      municipioNome: 'Cruzeiro',
    });
  });

  it('audit trail registra evento em toda mutação', async () => {
    const e = seed('pendente');
    await anaRevisaoRepository.aplicarRevisao(
      e.id,
      { novoStatus: 'revisada', correcoes: { latitude: -22.5 } },
      META_ATOR,
    );
    const eventos = _eventosMockAna();
    expect(eventos).toHaveLength(1);
    expect(eventos[0]!.evento).toBe('revisada');
    expect(eventos[0]!.atorId).toBe(META_ATOR.usuarioId);
    expect(eventos[0]!.valoresAntes).toMatchObject({ status: 'pendente' });
    expect(eventos[0]!.valoresDepois).toMatchObject({ status: 'revisada' });
  });
});
