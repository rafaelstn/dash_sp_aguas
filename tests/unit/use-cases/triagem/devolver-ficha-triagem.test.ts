import { afterEach, describe, expect, it } from 'vitest';
import { devolverFichaTriagem } from '@/application/use-cases/triagem/devolver-ficha-triagem';
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

const SOLICITACAO_VALIDA =
  'Refazer captura GPS no local correto. Cota da régua final inconsistente.';

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

describe('use-case/devolverFichaTriagem', () => {
  afterEach(() => {
    _resetTriagemMock();
  });

  it('happy path — devolve ficha pro técnico em estado devolvida com solicitação', async () => {
    const { ficha, papeis } = await fichaEmRevisao();
    const r = await devolverFichaTriagem(
      triagemRepository,
      papeis,
      ficha.id,
      APROVADOR_A,
      SOLICITACAO_VALIDA,
      META,
    );

    expect(r.estado).toBe('devolvida');
    expect(r.motivoDecisao).toBe(SOLICITACAO_VALIDA);
  });

  it('solicitação persiste no campo motivoDecisao da ficha (invariante)', async () => {
    const { ficha, papeis } = await fichaEmRevisao();
    await devolverFichaTriagem(
      triagemRepository,
      papeis,
      ficha.id,
      APROVADOR_A,
      SOLICITACAO_VALIDA,
      META,
    );
    const persistida = await triagemRepository.obterPorId(ficha.id);
    expect(persistida?.estado).toBe('devolvida');
    expect(persistida?.motivoDecisao).toBe(SOLICITACAO_VALIDA);
    expect(persistida?.decididaPor).toBe(APROVADOR_A);
    // Audit do evento `devolvida` confirmado pela mesma transação no mock.
  });

  it('rejeita solicitação curta (< 20 chars)', async () => {
    const { ficha, papeis } = await fichaEmRevisao();
    await expect(
      devolverFichaTriagem(
        triagemRepository,
        papeis,
        ficha.id,
        APROVADOR_A,
        'curto',
        META,
      ),
    ).rejects.toThrow(MotivoRejeicaoInsuficiente);
  });

  it('rejeita usuário sem papel aprovador', async () => {
    const { ficha } = await fichaEmRevisao();
    await expect(
      devolverFichaTriagem(
        triagemRepository,
        papeisFake({}),
        ficha.id,
        APROVADOR_A,
        SOLICITACAO_VALIDA,
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
      devolverFichaTriagem(
        triagemRepository,
        papeisSemMfa,
        ficha.id,
        APROVADOR_A,
        SOLICITACAO_VALIDA,
        META,
      ),
    ).rejects.toThrow(AprovadorSemMFA);
  });

  it('rejeita aprovador que não detém o lock', async () => {
    const { ficha, papeis } = await fichaEmRevisao();
    await expect(
      devolverFichaTriagem(
        triagemRepository,
        papeis,
        ficha.id,
        APROVADOR_B,
        SOLICITACAO_VALIDA,
        META,
      ),
    ).rejects.toThrow(LockRevisaoNegado);
  });

  it('estado devolvida é internamente terminal — segunda devolução falha', async () => {
    const { ficha, papeis } = await fichaEmRevisao();
    await devolverFichaTriagem(
      triagemRepository,
      papeis,
      ficha.id,
      APROVADOR_A,
      SOLICITACAO_VALIDA,
      META,
    );
    await expect(
      devolverFichaTriagem(
        triagemRepository,
        papeis,
        ficha.id,
        APROVADOR_A,
        SOLICITACAO_VALIDA,
        META,
      ),
    ).rejects.toThrow(EstadoTriagemInvalido);
  });
});
