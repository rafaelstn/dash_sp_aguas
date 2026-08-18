/**
 * `aceitarMatch` no adapter in-memory.
 *
 * O método lançava `Error('Mock: aceitar match nao implementado.')`, então em
 * modo demo (sem banco) aceitar um match sugerido no Inventário ANA estourava
 * na cara de quem estava usando. O adapter PG já era coberto por
 * `aceitar-match-atomico.test.ts`, que prova a transação; aqui provamos o
 * efeito no mock, que é o caminho do modo demo descrito no README.
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
const POSTO_ID = '22222222-2222-4222-8222-222222222222';
const PREFIXO = '3D-011';
const CODIGO_ANA = '58880001';

function seed(status: StatusRevisao = 'pendente') {
  _seedMockAnaLote(_criarLoteMock({ id: LOTE_ID, nome: 'teste' }));
  const estacao = _criarEstacaoMock({
    id: `est-${status}`,
    loteId: LOTE_ID,
    codigoAna: CODIGO_ANA,
    status,
  });
  _seedMockAnaEstacao(estacao);
  return estacao;
}

function params(estacaoId: string) {
  return {
    estacaoId,
    postoIdSugerido: POSTO_ID,
    prefixoSugerido: PREFIXO,
    codigoAna: CODIGO_ANA,
  };
}

describe('anaRevisaoRepository.aceitarMatch (mock)', () => {
  afterEach(() => _resetMockAna());

  it('não lança mais "nao implementado"', async () => {
    const e = seed('pendente');
    await expect(
      anaRevisaoRepository.aceitarMatch(params(e.id), META_ATOR),
    ).resolves.toBeUndefined();
  });

  it('vincula a estação ao posto sugerido e marca a revisão como manual', async () => {
    const e = seed('pendente');
    await anaRevisaoRepository.aceitarMatch(params(e.id), META_ATOR);

    const depois = await anaRevisaoRepository.obterPorCodigo(LOTE_ID, CODIGO_ANA);
    expect(depois).toMatchObject({
      postoId: POSTO_ID,
      matchTipo: 'manual',
      status: 'revisada',
    });
    // Sem data de revisão, a trilha não diz QUANDO, e trilha sem quando não
    // serve a auditoria.
    expect(depois?.revisadoEm).toBeInstanceOf(Date);
  });

  it('registra evento de revisão com o posto vinculado e o ator', async () => {
    const e = seed('pendente');
    await anaRevisaoRepository.aceitarMatch(params(e.id), META_ATOR);

    const eventos = _eventosMockAna();
    expect(eventos).toHaveLength(1);
    expect(eventos[0]).toMatchObject({
      estacaoId: e.id,
      evento: 'revisada',
      atorId: META_ATOR.usuarioId,
    });
    expect(eventos[0]?.valoresDepois).toMatchObject({
      status: 'revisada',
      posto_id: POSTO_ID,
      posto_prefixo: PREFIXO,
    });
  });

  it('guarda o estado anterior na trilha, não só o novo', async () => {
    const e = seed('em_revisao');
    await anaRevisaoRepository.aceitarMatch(params(e.id), META_ATOR);

    expect(_eventosMockAna()[0]?.valoresAntes).toMatchObject({
      status: 'em_revisao',
    });
  });

  it('recusa estação inexistente em vez de criar uma calada', async () => {
    seed('pendente');
    await expect(
      anaRevisaoRepository.aceitarMatch(params('nao-existe'), META_ATOR),
    ).rejects.toThrow(/nao encontrada/);
  });

  it('respeita a máquina de estados: terminal não aceita match', async () => {
    // `promovida_a_posto` é terminal. Aceitar match a partir dela reabriria
    // um registro já concluído, e o mock tem que recusar igual ao PG.
    const e = seed('promovida_a_posto');
    await expect(
      anaRevisaoRepository.aceitarMatch(params(e.id), META_ATOR),
    ).rejects.toThrow(/transicao invalida/);

    // E o estado não pode ter sido tocado antes da recusa.
    const depois = await anaRevisaoRepository.obterPorCodigo(LOTE_ID, CODIGO_ANA);
    expect(depois?.status).toBe('promovida_a_posto');
    expect(depois?.postoId).not.toBe(POSTO_ID);
    expect(_eventosMockAna()).toHaveLength(0);
  });
});
