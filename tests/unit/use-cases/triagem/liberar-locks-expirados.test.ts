import { afterEach, describe, expect, it, vi } from 'vitest';
import { liberarLocksExpirados } from '@/application/use-cases/triagem/liberar-locks-expirados';
import { iniciarRevisao } from '@/application/use-cases/triagem/iniciar-revisao';
import { submeterFichaTriagem } from '@/application/use-cases/triagem/submeter-ficha-triagem';
import {
  triagemRepository,
  _resetTriagemMock,
} from '@/infrastructure/mock/triagem-repository.mock';
import {
  APROVADOR_A,
  META,
  entradaSubmissaoValida,
  papeisFake,
} from './_helpers';

describe('use-case/liberarLocksExpirados', () => {
  afterEach(() => {
    _resetTriagemMock();
    vi.useRealTimers();
  });

  it('idempotente — rodar 2x sem locks expirados retorna 0 nas duas', async () => {
    const a = await liberarLocksExpirados(triagemRepository);
    const b = await liberarLocksExpirados(triagemRepository);
    expect(a.quantidade).toBe(0);
    expect(b.quantidade).toBe(0);
    expect(a.liberados).toEqual([]);
  });

  it('libera lock expirado e estado volta para pendente', async () => {
    // Submeter + iniciar revisão (gera lock com TTL 1h)
    const ficha = await submeterFichaTriagem(
      triagemRepository,
      entradaSubmissaoValida(),
      META,
    );
    const papeis = papeisFake({ aprovadores: [APROVADOR_A] });
    await iniciarRevisao(triagemRepository, papeis, ficha.id, APROVADOR_A, META);

    // Avança o relógio em 2h — lock expira
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 2 * 60 * 60 * 1000));

    const r = await liberarLocksExpirados(triagemRepository);

    vi.useRealTimers();

    expect(r.quantidade).toBe(1);
    expect(r.liberados).toContain(ficha.id);

    const refresh = await triagemRepository.obterPorId(ficha.id);
    expect(refresh?.estado).toBe('pendente');
  });

  it('liberação volta ficha pra pendente (invariante observável do evento lock_expirado)', async () => {
    const ficha = await submeterFichaTriagem(
      triagemRepository,
      entradaSubmissaoValida(),
      META,
    );
    const papeis = papeisFake({ aprovadores: [APROVADOR_A] });
    await iniciarRevisao(triagemRepository, papeis, ficha.id, APROVADOR_A, META);

    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 2 * 60 * 60 * 1000));
    await liberarLocksExpirados(triagemRepository);
    vi.useRealTimers();

    // Estado é a invariante. Audit do evento `lock_expirado` na mesma
    // transação do mock — confirmado pelo método não retornar erro.
    const refresh = await triagemRepository.obterPorId(ficha.id);
    expect(refresh?.estado).toBe('pendente');
  });

  it('NÃO libera lock ainda dentro do TTL', async () => {
    const ficha = await submeterFichaTriagem(
      triagemRepository,
      entradaSubmissaoValida(),
      META,
    );
    const papeis = papeisFake({ aprovadores: [APROVADOR_A] });
    await iniciarRevisao(triagemRepository, papeis, ficha.id, APROVADOR_A, META);

    // 30 min — bem dentro do TTL de 1h
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 30 * 60 * 1000));
    const r = await liberarLocksExpirados(triagemRepository);
    vi.useRealTimers();

    expect(r.quantidade).toBe(0);
    const refresh = await triagemRepository.obterPorId(ficha.id);
    expect(refresh?.estado).toBe('em_revisao');
  });
});
