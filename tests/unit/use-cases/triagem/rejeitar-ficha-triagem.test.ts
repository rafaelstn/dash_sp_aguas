import { afterEach, describe, expect, it } from 'vitest';
import { rejeitarFichaTriagem } from '@/application/use-cases/triagem/rejeitar-ficha-triagem';
import { iniciarRevisao } from '@/application/use-cases/triagem/iniciar-revisao';
import { submeterFichaTriagem } from '@/application/use-cases/triagem/submeter-ficha-triagem';
import {
  triagemRepository,
  _resetTriagemMock,
} from '@/infrastructure/mock/triagem-repository.mock';
import {
  AprovadorSemMFA,
  EstadoTriagemInvalido,
  LockRevisaoNegado,
  MotivoRejeicaoInsuficiente,
  UsuarioNaoEhAprovador,
} from '@/domain/errors';
import {
  APROVADOR_A,
  APROVADOR_B,
  META,
  entradaSubmissaoValida,
  papeisFake,
} from './_helpers';

const MOTIVO_VALIDO = 'GPS fora do entorno do posto declarado — verificar relato.';

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

describe('use-case/rejeitarFichaTriagem', () => {
  afterEach(() => {
    _resetTriagemMock();
  });

  it('happy path — estado vai para rejeitada e motivo é registrado', async () => {
    const { ficha, papeis } = await fichaEmRevisao();
    const r = await rejeitarFichaTriagem(
      triagemRepository,
      papeis,
      ficha.id,
      APROVADOR_A,
      MOTIVO_VALIDO,
      META,
    );

    expect(r.estado).toBe('rejeitada');
    expect(r.motivoDecisao).toBe(MOTIVO_VALIDO);
    expect(r.decididaPor).toBe(APROVADOR_A);
  });

  it('motivo persiste no campo motivoDecisao da ficha (invariante)', async () => {
    const { ficha, papeis } = await fichaEmRevisao();
    await rejeitarFichaTriagem(
      triagemRepository,
      papeis,
      ficha.id,
      APROVADOR_A,
      MOTIVO_VALIDO,
      META,
    );
    const persistida = await triagemRepository.obterPorId(ficha.id);
    expect(persistida?.estado).toBe('rejeitada');
    expect(persistida?.motivoDecisao).toBe(MOTIVO_VALIDO);
    expect(persistida?.decididaPor).toBe(APROVADOR_A);
    // Audit do evento `rejeitada` confirmado pela mesma transação no mock.
  });

  it('rejeita motivo com 19 chars (limite mínimo é 20)', async () => {
    const { ficha, papeis } = await fichaEmRevisao();
    await expect(
      rejeitarFichaTriagem(
        triagemRepository,
        papeis,
        ficha.id,
        APROVADOR_A,
        'a'.repeat(19),
        META,
      ),
    ).rejects.toThrow(MotivoRejeicaoInsuficiente);
  });

  it('rejeita motivo composto só de whitespace', async () => {
    const { ficha, papeis } = await fichaEmRevisao();
    await expect(
      rejeitarFichaTriagem(
        triagemRepository,
        papeis,
        ficha.id,
        APROVADOR_A,
        '                              ',
        META,
      ),
    ).rejects.toThrow(MotivoRejeicaoInsuficiente);
  });

  it('rejeita usuário sem papel aprovador', async () => {
    const { ficha } = await fichaEmRevisao();
    const papeisSemPapel = papeisFake({});
    await expect(
      rejeitarFichaTriagem(
        triagemRepository,
        papeisSemPapel,
        ficha.id,
        APROVADOR_A,
        MOTIVO_VALIDO,
        META,
      ),
    ).rejects.toThrow(UsuarioNaoEhAprovador);
  });

  it('rejeita aprovador sem MFA', async () => {
    const { ficha } = await fichaEmRevisao();
    const papeisSemMfa = papeisFake({
      aprovadores: [APROVADOR_A],
      semMfa: [APROVADOR_A],
    });
    await expect(
      rejeitarFichaTriagem(
        triagemRepository,
        papeisSemMfa,
        ficha.id,
        APROVADOR_A,
        MOTIVO_VALIDO,
        META,
      ),
    ).rejects.toThrow(AprovadorSemMFA);
  });

  it('rejeita rejeição por aprovador que não detém o lock', async () => {
    const { ficha, papeis } = await fichaEmRevisao();
    await expect(
      rejeitarFichaTriagem(
        triagemRepository,
        papeis,
        ficha.id,
        APROVADOR_B,
        MOTIVO_VALIDO,
        META,
      ),
    ).rejects.toThrow(LockRevisaoNegado);
  });

  it('rejeita rejeição de ficha já em estado terminal', async () => {
    const { ficha, papeis } = await fichaEmRevisao();
    await rejeitarFichaTriagem(
      triagemRepository,
      papeis,
      ficha.id,
      APROVADOR_A,
      MOTIVO_VALIDO,
      META,
    );
    await expect(
      rejeitarFichaTriagem(
        triagemRepository,
        papeis,
        ficha.id,
        APROVADOR_A,
        MOTIVO_VALIDO,
        META,
      ),
    ).rejects.toThrow(EstadoTriagemInvalido);
  });
});
