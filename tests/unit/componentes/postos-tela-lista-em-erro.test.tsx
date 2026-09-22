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

/**
 * Os alertas que anunciam ESTA falha, e não todos os da página.
 *
 * A primeira versão desta régua contava `role="alert"` na tela inteira, o que
 * media "no máximo um alerta na página" em vez de "um alerta por falha":
 * qualquer alerta legítimo que entrasse na tela depois a faria reprovar por
 * motivo alheio ao achado, e o conserto natural seria afrouxar o número, não
 * consertar a contagem.
 */
function alertasDaFalha(): HTMLElement[] {
  return screen
    .getAllByRole('alert')
    .filter((a) => a.textContent?.includes(TITULO_DA_FALHA));
}

/** O que está fora do alerta do mapa, que é o painel da lista. */
function foraDoAlerta<T extends HTMLElement>(elementos: T[]): T[] {
  const [alerta] = alertasDaFalha();
  expect(alerta, 'nenhum alerta anuncia a falha da carga dos postos').toBeDefined();
  return elementos.filter((e) => !alerta?.contains(e));
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

    expect(alertasDaFalha()).toHaveLength(1);
  });

  it('conta só os alertas desta falha, e não os da página', async () => {
    // Autoteste da contagem: um alerta legítimo de outro assunto não pode
    // reprovar o caso acima. Sem este controle, a régua mediria "no máximo um
    // alerta na tela", e o conserto natural de uma reprovação alheia seria
    // afrouxar o número em vez de olhar o que ela conta.
    await telaComFalha(500);

    const alheio = document.createElement('div');
    alheio.setAttribute('role', 'alert');
    alheio.textContent = 'Sua sessão foi renovada';
    document.body.append(alheio);

    try {
      expect(screen.getAllByRole('alert')).toHaveLength(2);
      expect(alertasDaFalha()).toHaveLength(1);
    } finally {
      alheio.remove();
    }
  });

  it('com a sessão expirada oferece entrar, e não tentar de novo', async () => {
    // O 401 é a outra metade do painel: repetir "Tentar de novo" ali levaria a
    // pessoa a insistir numa carga que só a entrada resolve.
    await telaComFalha(401);

    expect(
      foraDoAlerta(screen.getAllByRole('link', { name: 'Entrar' })),
    ).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).toBeNull();
    expect(alertasDaFalha()).toHaveLength(1);
  });
});
