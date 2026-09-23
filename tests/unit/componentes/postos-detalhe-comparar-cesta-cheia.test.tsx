/**
 * Achado do QA de acabamento de 23/09/2026, no detalhe do posto do mapa.
 *
 * Quando a cesta de comparação já está cheia (8 estações), o botão "Comparar
 * chuva" do posto pluviométrico ficava `disabled` e o motivo do impedimento
 * vivia só no atributo `title`. É o mesmo defeito que o achado 3 do QA de
 * 22/09/2026 reprovou no atalho "série inteira" de `series/SeletorJanela`, e que
 * o `BotaoAtalho` de lá já corrigiu: `title` aparece ao parar o mouse em cima e
 * em nenhuma outra situação, e botão `disabled` sai da ordem de foco, então quem
 * navega por teclado ou por leitor de tela encontra um botão apagado sem
 * explicação nenhuma. WCAG 1.3.1 e 3.3.2, e-MAG 6.5, e o cliente é órgão
 * público: é obrigação legal, não preferência.
 *
 * O caso mede as DUAS metades, porque corrigir uma sozinha deixa o defeito de
 * pé: o motivo tem de estar na descrição acessível do botão, e o botão tem de
 * continuar alcançável pelo foco (é chegando nele que a descrição é anunciada).
 *
 * A ausência do `title` vem antes da descrição e não é redundante: o cálculo da
 * descrição acessível cai no `title` quando não há `aria-describedby`, de modo
 * que a linha da descrição, sozinha, aprovaria o defeito original.
 *
 * O número 8 não é escrito aqui: sai de `MAX_COMPARACAO`, que é quem recusa a
 * inclusão. Escrito à mão nos dois lugares, ele divergiria na primeira mudança
 * de teto e o caso passaria a concordar com a tela em vez de medir.
 *
 * `DetalhePosto` busca `/api/monitor/postos/<prefixo>/series` ao montar, então o
 * `fetch` global é sempre um dublê aqui: a resposta é uma lista vazia e
 * bem-sucedida, porque numa falha `SecaoSeries` desenha o seu próprio botão
 * "Tentar de novo" e ele colidiria com o que este caso procura.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DetalhePosto } from '@/components/features/postos/mapa/DetalhePosto';
import { MAX_COMPARACAO } from '@/components/features/monitor/useComparacao';
import type { PontoMapaPosto } from '@/domain/mapa-postos';
import type { Estacao } from '@/components/features/monitor/tipos';

import { violacoesEmLinha } from '../../apoio/acessibilidade';

const MOTIVO =
  `A comparação de chuva já tem o máximo de ${MAX_COMPARACAO} estações. ` +
  'Remova uma estação da comparação para incluir esta.';

const PONTO: PontoMapaPosto = {
  prefixo: 'D4-018',
  nome: 'Posto de ensaio',
  lat: -23.5,
  lon: -46.6,
  tipo: 'plu',
  situacao: 'em_operacao',
  transmissao: [],
  vazao: [],
  ugrhi: 6,
  municipio: 'SÃO PAULO',
  uf: 'SP',
  coordenadaSuspeita: false,
};

const ESTACAO: Estacao = {
  id: 'e1',
  prefixo: 'D4-018',
  nome: 'Posto de ensaio',
  lat: -23.5,
  lng: -46.6,
  tipo: 'automatico',
  tipoEstacao: 'pluviometrico',
  bacia: null,
  owner: null,
  vinculadoAPosto: true,
  sibhId: 's1',
  criadoEm: '2024-01-01T00:00:00.000Z',
  online: true,
  ultimaTransmissao: '2024-01-01T00:00:00.000Z',
};

/** Sempre presente: `DetalhePosto` busca as séries ao montar. */
function comFetchNeutro() {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ series: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    ),
  );
}

function renderizar(naCesta: boolean, podeAdicionar: boolean) {
  comFetchNeutro();
  const alternar = vi.fn();
  const resultado = render(
    <DetalhePosto
      ponto={PONTO}
      comparacao={{
        situacao: 'pronta',
        estacao: ESTACAO,
        naCesta,
        podeAdicionar,
        alternar,
      }}
      aoVoltar={() => {}}
    />,
  );
  return { ...resultado, alternar };
}

function botaoComparar(): HTMLElement {
  return screen.getByRole('button', { name: /Comparar chuva|Na comparação de chuva/ });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('botão de comparar chuva com a cesta de comparação cheia', () => {
  it('leva o motivo na descrição acessível, e não num title', async () => {
    const { container } = renderizar(false, false);
    const botao = botaoComparar();

    expect(botao).not.toHaveAttribute('title');
    expect(botao).toHaveAccessibleDescription(MOTIVO);
    expect(await violacoesEmLinha(container)).toEqual([]);
  });

  it('continua alcançável pelo foco, que é como o motivo é anunciado', () => {
    renderizar(false, false);
    const botao = botaoComparar();

    // Botão `disabled` sai da ordem de foco: o `focus()` não pega e a descrição
    // nunca chega a ser anunciada. É essa a metade que o `title` não resolvia.
    botao.focus();
    expect(botao).toHaveFocus();
    expect(botao).toHaveAttribute('aria-disabled', 'true');
  });

  it('não inclui na cesta, nem por clique nem por Enter', async () => {
    // Alcançável pelo foco não pode virar clicável: a inclusão continua
    // impedida, e é por isso que o impedimento é anunciado em vez de silenciado.
    const { alternar } = renderizar(false, false);
    const botao = botaoComparar();

    await userEvent.click(botao);
    botao.focus();
    await userEvent.keyboard('{Enter}');

    expect(alternar).not.toHaveBeenCalled();
  });

  it('com vaga na cesta, é um botão comum que inclui', async () => {
    // Controle: a régua tem de aprovar o legítimo. Sem ele, "impedir sempre"
    // passaria nos casos acima e quebraria a comparação para todo mundo.
    const { alternar } = renderizar(false, true);
    const botao = botaoComparar();

    expect(botao).not.toHaveAttribute('aria-disabled');
    expect(botao).toHaveAccessibleDescription('');
    expect(botao).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(botao);
    expect(alternar).toHaveBeenCalledTimes(1);
  });

  it('com a cesta cheia mas a estação já dentro, remover continua permitido', async () => {
    // O segundo controle, e o que separa "cesta cheia" de "esta estação está
    // fora": tirar da comparação nunca estoura teto nenhum, então impedir aqui
    // deixaria a pessoa sem como desfazer a própria seleção.
    const { alternar } = renderizar(true, false);
    const botao = botaoComparar();

    expect(botao).not.toHaveAttribute('aria-disabled');
    expect(botao).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(botao);
    expect(alternar).toHaveBeenCalledTimes(1);
  });
});
