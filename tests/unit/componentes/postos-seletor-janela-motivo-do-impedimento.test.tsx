/**
 * Regressão do achado 3 do QA de 22/09/2026.
 *
 * O atalho "série inteira" fica impedido quando a série é mais longa que o teto
 * por consulta (3.660 dias), e o motivo disso vivia só no atributo `title`.
 * `title` aparece ao parar o mouse em cima e em nenhuma outra situação: quem
 * navega por teclado não tem como chegar num botão `disabled` (ele sai da ordem
 * de foco), e quem usa leitor de tela ouve um botão apagado sem explicação. O
 * cliente é órgão público, então WCAG 1.3.1 e 3.3.2 e o e-MAG 6.5 são obrigação
 * legal, e não preferência.
 *
 * O caso mede as duas metades, porque corrigir uma sozinha deixa o defeito de
 * pé: o motivo tem de estar na DESCRIÇÃO ACESSÍVEL do botão (e não em texto
 * solto na tela) e o botão tem de continuar alcançável pelo foco.
 *
 * Medir a existência do `aria-describedby` seria medir a forma: descrição
 * apontando para elemento vazio, ou para outro botão, passaria igual.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SeletorJanela } from '@/components/features/postos/series/SeletorJanela';
import { janelaPadrao } from '@/components/features/postos/series/formato';
import type { ResumoSerie } from '@/application/ports/series-medicao-repository';

import { violacoesEmLinha } from '../../apoio/acessibilidade';

function serie(primeira: string, ultima: string): ResumoSerie {
  return {
    serie: 'chuva_manual',
    rotulo: 'Chuva (leitura manual)',
    unidade: 'mm',
    unidadeInferida: false,
    criterioDiario: 'soma',
    leituras: 4000,
    primeiraData: primeira,
    ultimaData: ultima,
    ultimaDataComValor: ultima,
    leiturasComDataFutura: 0,
    leiturasSemValor: 0,
  };
}

/**
 * 01/01/2000 a 31/12/2010, inclusive nas duas pontas: 11 anos, três bissextos
 * (2000, 2004 e 2008), logo 11 × 365 + 3 = 4.018 dias. Passa dos 3.660 do teto.
 *
 * A conta está escrita porque o número entra na asserção: copiá-lo da saída do
 * próprio componente faria o caso concordar com qualquer coisa que ele dissesse.
 */
const LONGA = serie('2000-01-01', '2010-12-31');
const MOTIVO = 'A série tem 4.018 dias e o máximo por consulta é 3.660.';

/** 366 dias: cabe inteira numa consulta. */
const CURTA = serie('2020-01-01', '2020-12-31');

function renderizar(resumo: ResumoSerie, onAplicar = vi.fn()) {
  const janela = janelaPadrao(resumo);
  if (!janela) throw new Error('fixture sem janela padrão');
  const resultado = render(
    <SeletorJanela
      resumo={resumo}
      janela={janela}
      carregando={false}
      onAplicar={onAplicar}
    />,
  );
  return { ...resultado, onAplicar };
}

function atalhoDaSerieInteira(): HTMLElement {
  return screen.getByRole('button', { name: 'série inteira' });
}

describe('atalho de série inteira impedido pelo teto por consulta', () => {
  it('leva o motivo na descrição acessível, e não num title', async () => {
    const { container } = renderizar(LONGA);
    const botao = atalhoDaSerieInteira();

    // A ausência do `title` vem PRIMEIRO, e não é redundante: o cálculo da
    // descrição acessível (dom-accessibility-api, o mesmo que o jest-dom usa)
    // cai no `title` quando não há `aria-describedby`. Medido no mutante deste
    // caso: com o defeito de volta, a linha da descrição passava verde. Sozinha,
    // ela aprovaria exatamente o que o achado 3 reprovou.
    expect(botao).not.toHaveAttribute('title');
    expect(botao).toHaveAccessibleDescription(MOTIVO);
    expect(await violacoesEmLinha(container)).toEqual([]);
  });

  it('continua alcançável pelo foco, que é como o motivo é anunciado', () => {
    renderizar(LONGA);
    const botao = atalhoDaSerieInteira();

    // Botão `disabled` sai da ordem de foco: o `focus()` não pega, e a descrição
    // nunca é anunciada. É essa a metade que o `title` não resolvia.
    botao.focus();
    expect(botao).toHaveFocus();
    expect(botao).toHaveAttribute('aria-disabled', 'true');
  });

  it('não consulta o período que estouraria o teto, nem por clique nem por Enter', async () => {
    // Alcançável pelo foco não pode virar clicável: a consulta continua
    // impedida, e é por isso que o impedimento é anunciado em vez de virar 400.
    const { onAplicar } = renderizar(LONGA);
    const botao = atalhoDaSerieInteira();

    await userEvent.click(botao);
    botao.focus();
    await userEvent.keyboard('{Enter}');

    expect(onAplicar).not.toHaveBeenCalled();
  });

  it('com a série cabendo no teto, o atalho é um botão comum que consulta', async () => {
    // Controle: a régua tem de aprovar o legítimo. Sem ele, "impedir sempre"
    // passaria nos casos acima e quebraria o atalho para toda série curta.
    const { onAplicar } = renderizar(CURTA);
    const botao = atalhoDaSerieInteira();

    expect(botao).not.toHaveAttribute('aria-disabled');
    expect(botao).toHaveAccessibleDescription('');

    await userEvent.click(botao);

    expect(onAplicar).toHaveBeenCalledWith({
      desde: CURTA.primeiraData,
      ate: CURTA.ultimaDataComValor,
    });
  });
});
