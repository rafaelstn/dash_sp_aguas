/**
 * A régua de renderização e acessibilidade se prova antes de julgar o produto.
 *
 * Régua nova é suspeita até reprovar o defeito E aprovar o legítimo. Este
 * arquivo não testa nenhum componente do projeto: ele testa o aparelho, com
 * marcação escrita à mão. Se um dia a suíte de componentes ficar toda verde de
 * repente, é aqui que se descobre se foi o produto que melhorou ou o aparelho
 * que parou de medir.
 *
 * Os defeitos usados como amostra são os mesmos que o QA de 22/09/2026 achou
 * lendo o JSX à mão, e é por isso que eles estão aqui em forma reduzida.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { niveisDosTitulos, violacoesEmLinha } from '../apoio/acessibilidade';
import { definirMediaQueries } from '../setup-dom';

describe('a régua de acessibilidade', () => {
  it('reprova o botão sem nome acessível', async () => {
    const { container } = render(
      <button type="button">
        <svg aria-hidden="true" width="16" height="16" />
      </button>,
    );
    const achados = await violacoesEmLinha(container);
    expect(achados.join(' | ')).toContain('button-name');
  });

  it('aprova a mesma marcação depois de nomeada', async () => {
    const { container } = render(
      <button type="button" aria-label="Fechar o painel">
        <svg aria-hidden="true" width="16" height="16" />
      </button>,
    );
    expect(await violacoesEmLinha(container)).toEqual([]);
  });

  it('enxerga o contador dentro do rótulo mudando o nome do controle', () => {
    // O defeito real: uma região `aria-live` dentro do `<label>` entra no nome
    // acessível, e o controle passa a se chamar "Outras redes (SIBH) 1.234".
    // Nome de controle não muda sozinho (WCAG 4.1.2).
    render(
      <label>
        <input type="checkbox" />
        Outras redes (SIBH)
        <span role="status">1.234</span>
      </label>,
    );
    // Sem espaço entre o rótulo e o número: o nome acessível é a concatenação
    // do conteúdo do `<label>`, e o JSX não inseriu separador nenhum. É esse
    // valor grudado que o leitor de tela anuncia.
    expect(screen.getByRole('checkbox')).toHaveAccessibleName(
      'Outras redes (SIBH)1.234',
    );
  });

  it('aprova o mesmo controle com o contador fora do rótulo', () => {
    render(
      <div>
        <label htmlFor="sibh">Outras redes (SIBH)</label>
        <input id="sibh" type="checkbox" />
        <span role="status">1.234</span>
      </div>,
    );
    expect(screen.getByRole('checkbox')).toHaveAccessibleName(
      'Outras redes (SIBH)',
    );
  });

  it('reprova o salto de nível entre títulos', async () => {
    const { container } = render(
      <main>
        <h1>Postos</h1>
        <h4>Filtros</h4>
      </main>,
    );
    expect(niveisDosTitulos(container)).toEqual([1, 4]);
    expect((await violacoesEmLinha(container)).join(' | ')).toContain(
      'heading-order',
    );
  });

  it('o dublê de media query responde só à consulta declarada no teste', () => {
    expect(window.matchMedia('(max-width: 767px)').matches).toBe(false);
    definirMediaQueries(['(max-width: 767px)']);
    expect(window.matchMedia('(max-width: 767px)').matches).toBe(true);
    expect(window.matchMedia('(max-width: 480px)').matches).toBe(false);
  });

  it('a consulta declarada não vaza para o teste seguinte', () => {
    // Prova do `afterEach` do setup: o caso anterior ligou a tela estreita.
    expect(window.matchMedia('(max-width: 767px)').matches).toBe(false);
  });
});
