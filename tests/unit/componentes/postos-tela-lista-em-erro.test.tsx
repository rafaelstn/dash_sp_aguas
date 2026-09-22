/**
 * Regressão do achado 4 do QA de 22/09/2026, corrigido no commit 53ef06c.
 *
 * Com a carga dos postos em falha, o painel da lista dizia "A lista aparece
 * quando os postos carregarem": uma frase de ESPERA para algo que já tinha
 * falhado, sem dizer o que houve e sem ação. Em tela estreita o painel fica
 * abaixo do mapa, então é essa a frase que quem rolou a página lê.
 *
 * A correção repete ali a mensagem e a ação do alerta do mapa, e de propósito
 * SEM `role="alert"`: dois alertas simultâneos fazem o leitor de tela anunciar a
 * mesma falha duas vezes. Os dois lados do achado estão medidos aqui, porque
 * corrigir um sozinho reintroduz o outro.
 *
 * A tela inteira é montada de propósito. O painel da lista não é componente
 * próprio, e a contagem de `role="alert"` só existe como propriedade da PÁGINA:
 * medir uma peça isolada não responderia "anuncia duas vezes?".
 */
import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TelaPostos } from '@/components/features/postos/mapa/TelaPostos';

import { renderizarComUrl } from '../../apoio/renderizar';

const TITULO_DA_FALHA = 'Não foi possível carregar os postos';

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Monta a tela com a carga dos postos respondendo o status informado. */
async function telaComFalha(status: number) {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ mensagem: 'Origem indisponível.' }), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
    ),
  );

  renderizarComUrl(<TelaPostos />);

  await waitFor(() => {
    expect(screen.getAllByText(TITULO_DA_FALHA).length).toBeGreaterThan(0);
  });
}

/** O alerta do mapa, e o que está fora dele, que é o painel da lista. */
function foraDoAlerta<T extends HTMLElement>(elementos: T[]): T[] {
  const alerta = screen.getByRole('alert');
  return elementos.filter((e) => !alerta.contains(e));
}

describe('painel da lista com a carga dos postos em falha', () => {
  it('diz o que houve e oferece a ação, além do alerta do mapa', async () => {
    await telaComFalha(500);

    expect(foraDoAlerta(screen.getAllByText(TITULO_DA_FALHA))).toHaveLength(1);
    expect(
      foraDoAlerta(screen.getAllByRole('button', { name: 'Tentar de novo' })),
    ).toHaveLength(1);
    expect(
      screen.queryByText(/A lista aparece quando os postos carregarem/),
    ).toBeNull();
  });

  it('não anuncia a mesma falha duas vezes', async () => {
    await telaComFalha(500);

    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('com a sessão expirada oferece entrar, e não tentar de novo', async () => {
    // O 401 é a outra metade do painel: repetir "Tentar de novo" ali levaria a
    // pessoa a insistir numa carga que só a entrada resolve.
    await telaComFalha(401);

    expect(
      foraDoAlerta(screen.getAllByRole('link', { name: 'Entrar' })),
    ).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).toBeNull();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });
});
