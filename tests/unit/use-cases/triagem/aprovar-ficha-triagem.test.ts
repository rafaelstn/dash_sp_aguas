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
  postosFake,
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
      postosFake(),
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
      postosFake(),
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
      postosFake(),
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
        postosFake(),
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
        postosFake(),
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
      aprovarFichaTriagem(
        triagemRepository,
        papeis,
        postosFake(),
        ficha.id,
        APROVADOR_A,
        META,
      ),
    ).rejects.toThrow(EstadoTriagemInvalido);
  });

  it('rejeita reaprovação de ficha já aprovada (estado terminal §4.3)', async () => {
    const { ficha, papeis } = await fichaEmRevisao();
    await aprovarFichaTriagem(
        triagemRepository,
        papeis,
        postosFake(),
        ficha.id,
        APROVADOR_A,
        META,
      );

    await expect(
      aprovarFichaTriagem(
        triagemRepository,
        papeis,
        postosFake(),
        ficha.id,
        APROVADOR_A,
        META,
      ),
    ).rejects.toThrow(EstadoTriagemInvalido);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Posto ativo: a pergunta é do CADASTRO, e a resposta é da origem dele.
  //
  // Antes de 10/09/2026 quem respondia era `SELECT ... FROM postos` dentro da
  // transação de aprovação, contra a NOSSA tabela, que o ADR-0023 deixou vazia
  // por desenho. O efeito em produção era 409 `posto_inativo` para todo mundo.
  //
  // O caso do órgão dizendo "ativo" com a tabela local vazia está em
  // `tests/integration/triagem-aprovacao-postgres.test.ts`, contra Postgres de
  // verdade: aqui o mock não tem tabela nenhuma e não teria como reprovar.
  // ───────────────────────────────────────────────────────────────────────────

  it('recusa quando a origem do cadastro não tem o posto ativo (409)', async () => {
    const { ficha, papeis } = await fichaEmRevisao();

    await expect(
      aprovarFichaTriagem(
        triagemRepository,
        papeis,
        postosFake('ausente'),
        ficha.id,
        APROVADOR_A,
        META,
      ),
    ).rejects.toThrow(EstadoTriagemInvalido);

    // O efeito importa mais que o tipo do erro: a ficha NÃO pode ter sido
    // promovida. Sem esta linha, o caso passaria com a recusa acontecendo
    // depois da escrita.
    const persistida = await triagemRepository.obterPorId(ficha.id);
    expect(persistida?.estado).toBe('em_revisao');
    expect(persistida?.fichaVisitaId).toBeNull();
  });

  it('recusa quando a origem devolve o posto com soft delete (409)', async () => {
    const { ficha, papeis } = await fichaEmRevisao();

    await expect(
      aprovarFichaTriagem(
        triagemRepository,
        papeis,
        postosFake('removido'),
        ficha.id,
        APROVADOR_A,
        META,
      ),
    ).rejects.toThrow(EstadoTriagemInvalido);

    const persistida = await triagemRepository.obterPorId(ficha.id);
    expect(persistida?.estado).toBe('em_revisao');
  });

  it('o motivo da recusa é o posto, e não a transição: `de` diz posto_inativo', async () => {
    // Sem afirmar o `de`, os dois casos acima ficariam verdes sobre QUALQUER
    // `EstadoTriagemInvalido`, inclusive o da transição de estado, que é outro
    // defeito com o mesmo tipo de erro.
    const { ficha, papeis } = await fichaEmRevisao();

    await expect(
      aprovarFichaTriagem(
        triagemRepository,
        papeis,
        postosFake('ausente'),
        ficha.id,
        APROVADOR_A,
        META,
      ),
    ).rejects.toMatchObject({ de: 'posto_inativo', para: 'aprovada' });
  });

  it('ficha fora de em_revisao não é recusada pelo posto: o motivo real prevalece', async () => {
    // Estado errado E posto ausente ao mesmo tempo. A resposta tem de ser sobre
    // a TRANSIÇÃO (é o que o `FOR UPDATE` do repositório apura), senão a pessoa
    // é mandada falar com o órgão por causa de uma ficha que já foi decidida.
    const ficha = await submeterFichaTriagem(
      triagemRepository,
      entradaSubmissaoValida(),
      META,
    );
    const papeis = papeisFake({ aprovadores: [APROVADOR_A] });

    await expect(
      aprovarFichaTriagem(
        triagemRepository,
        papeis,
        postosFake('ausente'),
        ficha.id,
        APROVADOR_A,
        META,
      ),
    ).rejects.toMatchObject({ de: 'pendente', para: 'aprovada' });
  });

  it('não pergunta ao cadastro antes de conferir o papel de aprovador', async () => {
    // Ordem importa: quem não é aprovador não pode disparar consulta ao banco
    // do órgão. `postosFake` que joga ao ser chamado prova isso — se a ordem
    // inverter, o erro que sai é o do fake e não `UsuarioNaoEhAprovador`.
    const { ficha } = await fichaEmRevisao();
    const cadastroProibido = {
      async buscarPorPrefixo() {
        throw new Error('cadastro consultado antes de conferir o papel');
      },
    } as never;

    await expect(
      aprovarFichaTriagem(
        triagemRepository,
        papeisFake({}),
        cadastroProibido,
        ficha.id,
        APROVADOR_A,
        META,
      ),
    ).rejects.toThrow(UsuarioNaoEhAprovador);
  });
});
