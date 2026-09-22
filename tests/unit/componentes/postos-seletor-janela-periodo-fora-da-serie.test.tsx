/**
 * Regressão do achado 4 do QA de 22/09/2026.
 *
 * O formulário é `noValidate`, então o navegador não cobre o `min` e o `max` dos
 * campos, e a régua de envio só olhava a ordem das datas e o teto de dias. Quem
 * digitasse um período fora da extensão da série (numa série que parou em 2004,
 * pedir 2010) fazia a consulta ir até o banco do órgão, voltar vazia e a tela
 * responder que a origem não tem nenhuma linha no período. Isso descreve buraco
 * no dado, e o que houve foi outra coisa: o período pedido não existe na série.
 * Numa tela que serve para CONFERIR número com o órgão, a diferença é o
 * resultado inteiro.
 *
 * A régua recusa só o período SEM interseção com a série. Período que encosta
 * nela, mesmo em parte, devolve dado real, e recusá-lo seria a tela negar uma
 * consulta que responde: os dois controles abaixo existem para isso.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SeletorJanela } from '@/components/features/postos/series/SeletorJanela';
import { janelaPadrao } from '@/components/features/postos/series/formato';
import type { ResumoSerie } from '@/application/ports/series-medicao-repository';

import { violacoesEmLinha } from '../../apoio/acessibilidade';

/** Série curta e fechada: primeiro trimestre de 2024, 91 dias. */
const RESUMO: ResumoSerie = {
  serie: 'cota_rio',
  rotulo: 'Cota do rio (régua)',
  unidade: 'cm',
  unidadeInferida: false,
  criterioDiario: 'media',
  leituras: 182,
  primeiraData: '2024-01-01',
  ultimaData: '2024-03-31',
  ultimaDataComValor: '2024-03-31',
  leiturasComDataFutura: 0,
  leiturasSemValor: 0,
};

const FORA_DA_SERIE = 'O período pedido está fora da série, que vai de 01/01/2024 a 31/03/2024.';

function renderizar() {
  const onAplicar = vi.fn();
  const janela = janelaPadrao(RESUMO);
  if (!janela) throw new Error('fixture sem janela padrão');
  const resultado = render(
    <SeletorJanela
      resumo={RESUMO}
      janela={janela}
      carregando={false}
      onAplicar={onAplicar}
    />,
  );
  return { ...resultado, onAplicar };
}

/** Digita as duas datas e envia, que é o caminho de quem não usa os atalhos. */
function pedirPeriodo(desde: string, ate: string): void {
  fireEvent.change(screen.getByLabelText('De'), { target: { value: desde } });
  fireEvent.change(screen.getByLabelText('Até'), { target: { value: ate } });
  fireEvent.click(screen.getByRole('button', { name: 'Ver período' }));
}

describe('período pedido fora da extensão da série', () => {
  it('recusa antes da consulta o período depois do fim da série', async () => {
    const { container, onAplicar } = renderizar();

    // Âncora de presença: a tela abre sem erro nenhum, e é o envio que produz a
    // mensagem. Sem esta linha o caso passaria com um alerta preso de outra
    // coisa qualquer.
    expect(screen.queryByRole('alert')).toBeNull();

    pedirPeriodo('2025-01-01', '2025-02-01');

    expect(screen.getByRole('alert')).toHaveTextContent(FORA_DA_SERIE);
    expect(onAplicar).not.toHaveBeenCalled();
    expect(await violacoesEmLinha(container)).toEqual([]);
  });

  it('recusa também o período inteiro antes do começo da série', () => {
    // A outra metade da regra. Sem ela, corrigir só o fim deixaria de pé metade
    // do defeito, e é a metade que aparece em série que começa em 1888.
    const { onAplicar } = renderizar();

    pedirPeriodo('2020-01-01', '2020-06-30');

    expect(screen.getByRole('alert')).toHaveTextContent(FORA_DA_SERIE);
    expect(onAplicar).not.toHaveBeenCalled();
  });

  it('consulta o período que encosta na série, ainda que comece antes dela', () => {
    // Controle: ali existe dado. Uma régua de "período contido na série" passaria
    // nos dois casos acima e quebraria esta consulta, que é legítima e comum
    // (quem pede o ano inteiro de uma série que começou em março).
    const { onAplicar } = renderizar();

    pedirPeriodo('2023-12-01', '2024-01-15');

    expect(screen.queryByRole('alert')).toBeNull();
    expect(onAplicar).toHaveBeenCalledWith({ desde: '2023-12-01', ate: '2024-01-15' });
  });

  it('consulta o período dentro da série e deixa de mostrar o erro anterior', () => {
    // Segundo controle, com o estado errado antes: a recusa não pode travar a
    // tela. Quem corrige o período tem de conseguir seguir, e a mensagem sai.
    const { onAplicar } = renderizar();

    pedirPeriodo('2025-01-01', '2025-02-01');
    expect(screen.getByRole('alert')).toBeInTheDocument();

    pedirPeriodo('2024-02-01', '2024-02-29');

    expect(screen.queryByRole('alert')).toBeNull();
    expect(onAplicar).toHaveBeenCalledTimes(1);
    expect(onAplicar).toHaveBeenCalledWith({ desde: '2024-02-01', ate: '2024-02-29' });
  });
});
