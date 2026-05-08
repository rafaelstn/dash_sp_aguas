import { afterEach, describe, expect, it } from 'vitest';
import { iniciarRevisao } from '@/application/use-cases/triagem/iniciar-revisao';
import { submeterFichaTriagem } from '@/application/use-cases/triagem/submeter-ficha-triagem';
import { aprovarFichaTriagem } from '@/application/use-cases/triagem/aprovar-ficha-triagem';
import {
  triagemRepository,
  _resetTriagemMock,
} from '@/infrastructure/mock/triagem-repository.mock';
import {
  AprovadorSemMFA,
  EstadoTriagemInvalido,
  FichaTriagemNaoEncontrada,
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

describe('use-case/iniciarRevisao', () => {
  afterEach(() => {
    _resetTriagemMock();
  });

  it('happy path — aprovador com MFA adquire lock e estado vira em_revisao', async () => {
    const ficha = await submeterFichaTriagem(
      triagemRepository,
      entradaSubmissaoValida(),
      META,
    );
    const papeis = papeisFake({ aprovadores: [APROVADOR_A] });

    const resultado = await iniciarRevisao(
      triagemRepository,
      papeis,
      ficha.id,
      APROVADOR_A,
      META,
    );

    expect(resultado.ficha.estado).toBe('em_revisao');
    expect(resultado.expiraEm).toBeTruthy();
    expect(new Date(resultado.expiraEm).getTime()).toBeGreaterThan(Date.now());
  });

  it('lock fica visível na ficha persistida em estado em_revisao', async () => {
    const ficha = await submeterFichaTriagem(
      triagemRepository,
      entradaSubmissaoValida(),
      META,
    );
    const papeis = papeisFake({ aprovadores: [APROVADOR_A] });
    await iniciarRevisao(triagemRepository, papeis, ficha.id, APROVADOR_A, META);

    const persistida = await triagemRepository.obterPorId(ficha.id);
    expect(persistida?.estado).toBe('em_revisao');
    // Audit do evento `revisao_iniciada` é confirmado indiretamente:
    // sem o INSERT atômico no audit, o repo não chegaria a em_revisao.
    // Ver gap do mock em tests/setup.ts pra leitura direta de eventos.
  });

  it('rejeita usuário sem papel aprovador (403)', async () => {
    const ficha = await submeterFichaTriagem(
      triagemRepository,
      entradaSubmissaoValida(),
      META,
    );
    const papeis = papeisFake({ aprovadores: [] });

    await expect(
      iniciarRevisao(triagemRepository, papeis, ficha.id, APROVADOR_A, META),
    ).rejects.toThrow(UsuarioNaoEhAprovador);
  });

  it('rejeita aprovador sem MFA verificado (403)', async () => {
    const ficha = await submeterFichaTriagem(
      triagemRepository,
      entradaSubmissaoValida(),
      META,
    );
    const papeis = papeisFake({
      aprovadores: [APROVADOR_A],
      semMfa: [APROVADOR_A],
    });

    await expect(
      iniciarRevisao(triagemRepository, papeis, ficha.id, APROVADOR_A, META),
    ).rejects.toThrow(AprovadorSemMFA);
  });

  it('rejeita ficha inexistente com FichaTriagemNaoEncontrada', async () => {
    const papeis = papeisFake({ aprovadores: [APROVADOR_A] });
    await expect(
      iniciarRevisao(
        triagemRepository,
        papeis,
        '00000000-0000-4000-8000-000000000000',
        APROVADOR_A,
        META,
      ),
    ).rejects.toThrow(FichaTriagemNaoEncontrada);
  });

  it('lock cruzado — segundo aprovador recebe LockRevisaoNegado(ja_existe_lock)', async () => {
    const ficha = await submeterFichaTriagem(
      triagemRepository,
      entradaSubmissaoValida(),
      META,
    );
    const papeis = papeisFake({ aprovadores: [APROVADOR_A, APROVADOR_B] });

    await iniciarRevisao(triagemRepository, papeis, ficha.id, APROVADOR_A, META);

    try {
      await iniciarRevisao(
        triagemRepository,
        papeis,
        ficha.id,
        APROVADOR_B,
        META,
      );
      expect.fail('deveria ter lançado LockRevisaoNegado');
    } catch (e) {
      expect(e).toBeInstanceOf(LockRevisaoNegado);
      expect((e as LockRevisaoNegado).motivo).toBe('ja_existe_lock');
    }
  });

  it('rejeita transição de estado terminal (ex.: ficha aprovada)', async () => {
    // Submeter, iniciar, aprovar — fica aprovada — outra tentativa de iniciar
    const ficha = await submeterFichaTriagem(
      triagemRepository,
      entradaSubmissaoValida(),
      META,
    );
    const papeis = papeisFake({ aprovadores: [APROVADOR_A] });
    await iniciarRevisao(triagemRepository, papeis, ficha.id, APROVADOR_A, META);
    await aprovarFichaTriagem(triagemRepository, papeis, ficha.id, APROVADOR_A, META);

    await expect(
      iniciarRevisao(triagemRepository, papeis, ficha.id, APROVADOR_A, META),
    ).rejects.toThrow(EstadoTriagemInvalido);
  });

  describe('race em iniciarRevisao — Promise.all (V5 do threat model)', () => {
    it('com 2 aprovadores simultâneos, exatamente 1 sucede e 1 falha com lock_em_uso', async () => {
      const ficha = await submeterFichaTriagem(
        triagemRepository,
        entradaSubmissaoValida(),
        META,
      );
      const papeis = papeisFake({ aprovadores: [APROVADOR_A, APROVADOR_B] });

      const promessas = [
        iniciarRevisao(triagemRepository, papeis, ficha.id, APROVADOR_A, META).catch(
          (e) => ({ erro: e }),
        ),
        iniciarRevisao(triagemRepository, papeis, ficha.id, APROVADOR_B, META).catch(
          (e) => ({ erro: e }),
        ),
      ];

      const resultados = await Promise.all(promessas);

      const sucessos = resultados.filter((r) => 'ficha' in r);
      const falhas = resultados.filter((r) => 'erro' in r);

      expect(sucessos).toHaveLength(1);
      expect(falhas).toHaveLength(1);
      const erro = (falhas[0]! as { erro: Error }).erro;
      expect(erro).toBeInstanceOf(LockRevisaoNegado);
      expect((erro as LockRevisaoNegado).motivo).toBe('ja_existe_lock');
    });

    it('100 chamadas simultâneas com mesmo aprovador → 1 sucede, 99 falham', async () => {
      // Cenário extremo: idempotência sob alta concorrência. O lock UNIQUE
      // deve garantir consistência. Stress maior fica para o pen-test
      // automatizado em CI.
      const ficha = await submeterFichaTriagem(
        triagemRepository,
        entradaSubmissaoValida(),
        META,
      );
      const papeis = papeisFake({ aprovadores: [APROVADOR_A] });

      const promessas = Array.from({ length: 100 }, () =>
        iniciarRevisao(triagemRepository, papeis, ficha.id, APROVADOR_A, META).catch(
          (e) => ({ erro: e }),
        ),
      );
      const resultados = await Promise.all(promessas);
      const sucessos = resultados.filter((r) => 'ficha' in r);
      // Mock single-threaded, todas as concorrentes do mesmo aprovador veem
      // lock dele mesmo — só 1 ganha (já que estado vai pra em_revisao
      // depois da 1ª, demais caem em estado_invalido / lock_em_uso).
      expect(sucessos).toHaveLength(1);
    });
  });
});
