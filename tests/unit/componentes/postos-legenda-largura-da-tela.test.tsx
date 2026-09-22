/**
 * Regressão do achado 1 do QA de 22/09/2026.
 *
 * A legenda fica sobre o mapa, no canto inferior esquerdo, e aberta ela ocupa
 * uma faixa larga da área visível. Por isso ela nasce recolhida no celular, e a
 * decisão saía de `window.matchMedia('(max-width: 767px)')` medido UMA vez, na
 * montagem.
 *
 * Quem abre a tela em paisagem e gira o aparelho para retrato é justamente quem
 * fica com menos mapa: a largura cai, a legenda continua aberta e cobre o que a
 * pessoa girou o aparelho para ver. É o caso do fiscal em campo, que é onde
 * esta tela mais é usada no celular.
 *
 * O caso mede o EFEITO do giro (a legenda recolhe e o corpo dela sai da tela), e
 * não a existência do ouvinte: assinar o evento e não reagir a ele deixaria o
 * defeito de pé com o código parecendo corrigido.
 *
 * O dublê de `matchMedia` que avisa os ouvintes tem prova própria em
 * `tests/unit/regua-de-acessibilidade.test.tsx`. Sem ela, este arquivo mediria o
 * aparelho.
 */
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LegendaMapa } from '@/components/features/postos/mapa/LegendaMapa';
import { ESTADO_PADRAO } from '@/components/features/postos/mapa/estado-url';

import { definirMediaQueries } from '../../setup-dom';
import { violacoesEmLinha } from '../../apoio/acessibilidade';

/** O mesmo ponto de quebra que o componente consulta. */
const CELULAR = '(max-width: 767px)';

/** Item do corpo da legenda: presente só enquanto ela está aberta. */
const ITEM_DO_CORPO = 'Outras redes (SIBH)';

function renderizar() {
  return render(
    <LegendaMapa
      estado={ESTADO_PADRAO}
      naArea={[]}
      outrasRedes="desligada"
      totalOutrasRedes={0}
      aoAlternarOutrasRedes={vi.fn()}
    />,
  );
}

function botaoDaLegenda(): HTMLElement {
  return screen.getByRole('button', { name: 'Legenda' });
}

afterEach(() => {
  // O espião do último caso troca `window.matchMedia`, que é global do dublê.
  vi.restoreAllMocks();
});

/** Gira o aparelho: a largura muda com a tela já montada. */
function girarPara(consultas: string[]): void {
  act(() => {
    definirMediaQueries(consultas);
  });
}

describe('legenda do mapa e a largura da tela', () => {
  it('recolhe ao girar de paisagem para retrato', () => {
    renderizar();

    // Âncora de presença: em paisagem ela está aberta, e é esse estado que o
    // giro tem de desfazer. Sem esta linha o caso passaria com a legenda
    // recolhida desde sempre, por qualquer motivo.
    expect(botaoDaLegenda()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(ITEM_DO_CORPO)).toBeInTheDocument();

    girarPara([CELULAR]);

    expect(botaoDaLegenda()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(ITEM_DO_CORPO)).toBeNull();
  });

  it('volta a abrir ao girar de retrato para paisagem', () => {
    // A outra metade do mesmo comportamento: a largura é que decide. Sem ela, a
    // correção poderia ser "recolher e nunca mais abrir", que resolve o achado
    // e estraga o giro de volta.
    definirMediaQueries([CELULAR]);
    renderizar();

    expect(botaoDaLegenda()).toHaveAttribute('aria-expanded', 'false');

    girarPara([]);

    expect(botaoDaLegenda()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(ITEM_DO_CORPO)).toBeInTheDocument();
  });

  it('não desfaz o que a pessoa decidiu no botão', async () => {
    // A outra ponta da mesma régua: a largura decide enquanto ninguém decidiu.
    // Quem fecha a legenda para ver o mapa e depois redimensiona a janela, ou
    // gira o aparelho de volta para paisagem, não pode ver a legenda reaparecer
    // por cima sem ter pedido. É o incômodo do achado ao contrário, e uma
    // correção que só olhasse a largura o introduziria.
    renderizar();

    await userEvent.click(botaoDaLegenda());
    expect(botaoDaLegenda()).toHaveAttribute('aria-expanded', 'false');

    girarPara([CELULAR]);
    girarPara([]);

    expect(botaoDaLegenda()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(ITEM_DO_CORPO)).toBeNull();
  });

  it('nasce recolhida quando a tela já é estreita na montagem', async () => {
    // Controle: a régua tem de aprovar o legítimo. Este é o comportamento que
    // já existia e que a correção não pode perder.
    definirMediaQueries([CELULAR]);
    const { container } = renderizar();

    expect(botaoDaLegenda()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(ITEM_DO_CORPO)).toBeNull();
    expect(await violacoesEmLinha(container)).toEqual([]);
  });

  it('nasce aberta quando a tela é larga na montagem', () => {
    // Segundo controle: nada de recolher em desktop, onde a legenda não cobre
    // nada e é o que explica os símbolos do mapa.
    const { container } = renderizar();

    expect(botaoDaLegenda()).toHaveAttribute('aria-expanded', 'true');
    expect(container.querySelector('section')).toBeInTheDocument();
  });

  it('para de ouvir a largura ao sair da tela', () => {
    // Cada abertura da tela assina o evento. Sem a assinatura desfeita na
    // saída, uma sessão de trabalho acumula ouvintes mexendo em estado de
    // componente que já saiu, e no React 19 isso não emite aviso nenhum: some.
    //
    // A asserção é sobre a MESMA lista que o componente assinou, tomada do
    // `matchMedia` que ele chamou. Uma lista criada pelo teste seria outro
    // objeto, e aprovaria qualquer coisa.
    const espiao = vi.spyOn(window, 'matchMedia');
    const { unmount } = renderizar();

    const lista = espiao.mock.results[0]?.value as MediaQueryList | undefined;
    expect(lista, 'a legenda não consultou a largura da tela').toBeDefined();
    const deixouDeOuvir = vi.spyOn(lista as MediaQueryList, 'removeEventListener');

    unmount();

    expect(deixouDeOuvir).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
