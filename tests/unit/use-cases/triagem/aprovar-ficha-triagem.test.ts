import { afterEach, describe, expect, it } from 'vitest';
import { aprovarFichaTriagem } from '@/application/use-cases/triagem/aprovar-ficha-triagem';
import { iniciarRevisao } from '@/application/use-cases/triagem/iniciar-revisao';
import { submeterFichaTriagem } from '@/application/use-cases/triagem/submeter-ficha-triagem';
import {
  triagemRepository,
  _resetTriagemMock,
} from '@/infrastructure/mock/triagem-repository.mock';
import {
  EstadoTriagemInvalido,
  LockRevisaoNegado,
  UsuarioNaoEhAprovador,
} from '@/domain/errors';
import {
  APROVADOR_A,
  APROVADOR_B,
  META,
  entradaSubmissaoValida,
  papeisFake,
} from './_helpers';

async function fichaEmRevisao() {
  const ficha = await submeterFichaTriagem(
    triagemRepository,
    entradaSubmissaoValida(),
    META,
  );
  const papeis = papeisFake({ aprovadores: [APROVADOR_A, APROVADOR_B] });
  await iniciarRevisao(triagemRepository, papeis, ficha.id, APROVADOR_A, META);
  return { ficha, papeis };
}

describe('use-case/aprovarFichaTriagem', () => {
  afterEach(() => {
    _resetTriagemMock();
  });

  it('happy path — promove ficha para fichas_visita atomicamente', async () => {
    const { ficha, papeis } = await fichaEmRevisao();

    const resultado = await aprovarFichaTriagem(
      triagemRepository,
      papeis,
      ficha.id,
      APROVADOR_A,
      META,
    );

    expect(resultado.triagem.estado).toBe('aprovada');
    expect(resultado.fichaVisitaId).toBeTruthy();
    expect(resultado.triagem.fichaVisitaId).toBe(resultado.fichaVisitaId);
    expect(resultado.triagem.decididaPor).toBe(APROVADOR_A);
    expect(resultado.triagem.decididaEm).toBeTruthy();
  });

  it('invariante "aprovada ⇔ fichaVisitaId existe" preservada após sucesso', async () => {
    const { ficha, papeis } = await fichaEmRevisao();
    const r = await aprovarFichaTriagem(
      triagemRepository,
      papeis,
      ficha.id,
      APROVADOR_A,
      META,
    );

    const persistida = await triagemRepository.obterPorId(ficha.id);
    expect(persistida?.estado).toBe('aprovada');
    expect(persistida?.fichaVisitaId).toBe(r.fichaVisitaId);
  });

  it('promoção atômica deixa ficha em aprovada com fichaVisitaId — invariante visível', async () => {
    const { ficha, papeis } = await fichaEmRevisao();
    const r = await aprovarFichaTriagem(
      triagemRepository,
      papeis,
      ficha.id,
      APROVADOR_A,
      META,
    );

    const persistida = await triagemRepository.obterPorId(ficha.id);
    // Invariante "ficha aprovada ⇔ fichaVisitaId existe" (ADR-0008 §2.4).
    expect(persistida?.estado).toBe('aprovada');
    expect(persistida?.fichaVisitaId).toBe(r.fichaVisitaId);
    // Audit do evento `aprovada` confirmado pela mesma transação no mock.
  });

  it('rejeita usuário sem papel aprovador (403)', async () => {
    const { ficha } = await fichaEmRevisao();
    const papeisSemPapel = papeisFake({});

    await expect(
      aprovarFichaTriagem(
        triagemRepository,
        papeisSemPapel,
        ficha.id,
        APROVADOR_A,
        META,
      ),
    ).rejects.toThrow(UsuarioNaoEhAprovador);
  });

  it('rejeita aprovador que não detém o lock (LockRevisaoNegado)', async () => {
    const { ficha, papeis } = await fichaEmRevisao();
    // APROVADOR_B tem papel mas NÃO é o dono do lock (APROVADOR_A é).
    await expect(
      aprovarFichaTriagem(
        triagemRepository,
        papeis,
        ficha.id,
        APROVADOR_B,
        META,
      ),
    ).rejects.toThrow(LockRevisaoNegado);
  });

  it('rejeita aprovação de ficha em estado pendente (sem em_revisao)', async () => {
    const ficha = await submeterFichaTriagem(
      triagemRepository,
      entradaSubmissaoValida(),
      META,
    );
    const papeis = papeisFake({ aprovadores: [APROVADOR_A] });

    await expect(
      aprovarFichaTriagem(triagemRepository, papeis, ficha.id, APROVADOR_A, META),
    ).rejects.toThrow(EstadoTriagemInvalido);
  });

  it('rejeita reaprovação de ficha já aprovada (estado terminal §4.3)', async () => {
    const { ficha, papeis } = await fichaEmRevisao();
    await aprovarFichaTriagem(triagemRepository, papeis, ficha.id, APROVADOR_A, META);

    await expect(
      aprovarFichaTriagem(triagemRepository, papeis, ficha.id, APROVADOR_A, META),
    ).rejects.toThrow(EstadoTriagemInvalido);
  });
});
