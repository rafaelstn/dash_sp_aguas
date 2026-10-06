/**
 * Filtro de mantenedor na tela, pedido pelo órgão em 30/09/2026 ("a lista dos
 * mantenedores e quantos postos cada um tem").
 *
 * A regra e a contagem cruzada têm caso próprio no domínio
 * (`tests/unit/domain/mapa-postos.test.ts`); aqui se mede o que a pessoa vê e
 * consegue escolher, nas DUAS larguras do contrato, porque o desktop e o
 * celular montam o mesmo campo em lugares diferentes.
 *
 * As asserções são sobre o que o campo NOMEIA e sobre o que o clique PEDE
 * (`aoMudar` com o valor), nunca sobre a existência da opção: opção presente
 * que não muda filtro nenhum deixaria o pedido do órgão de pé.
 */
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FiltrosCelular, FiltrosDesktop } from '@/components/features/postos/mapa/FiltrosPostos';
import { ESTADO_PADRAO } from '@/components/features/postos/mapa/estado-url';
import { contarFacetas, type FacetasMapa, type PontoMapaPosto } from '@/domain/mapa-postos';

function posto(prefixo: string, mantenedor: string | null): PontoMapaPosto {
  return {
    prefixo,
    nome: `Posto ${prefixo}`,
    lat: -23.9,
    lon: -46.3,
    tipo: 'plu',
    situacao: 'em_operacao',
    transmissao: [],
    vazao: [],
    ugrhi: 7,
    municipio: 'SANTOS',
    uf: 'SP',
    mantenedor,
    coordenadaSuspeita: false,
  };
}

// As facetas saem de `contarFacetas`, que é quem as produz em produção: fixture
// escrita à mão divergiria do domínio sem ninguém perceber. Dois postos da
// SABESP com a caixa diferente no cadastro, um do DAEE e um sem operadora.
const POSTOS = [
  posto('B6-001', 'SABESP'),
  posto('B6-002', 'sabesp'),
  posto('B6-003', 'DAEE'),
  posto('B6-004', null),
];
const FACETAS = contarFacetas(POSTOS, {});

function renderizarDesktop(
  mantenedor: (typeof ESTADO_PADRAO)['mantenedor'],
  facetas: FacetasMapa | null = FACETAS,
) {
  const aoMudar = vi.fn();
  render(
    <FiltrosDesktop
      estado={{ ...ESTADO_PADRAO, mantenedor }}
      facetas={facetas}
      totalFiltrado={POSTOS.length}
      aoMudar={aoMudar}
      aoLimpar={vi.fn()}
    />,
  );
  return { aoMudar, campo: screen.getByRole('combobox', { name: 'Mantenedor' }) };
}

describe('desktop: a lista de mantenedores com a contagem', () => {
  it('mostra cada mantenedor com o total, em ordem alfabética e com o "sem" por último', () => {
    renderizarDesktop(null);

    // A SABESP soma os dois postos apesar da caixa diferente no cadastro: sem a
    // comparação sem caixa a lista teria "SABESP (1)" e "sabesp (1)".
    expect(screen.getByRole('option', { name: 'SABESP (2)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'DAEE (1)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Sem mantenedor (1)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Todos os mantenedores (4)' })).toBeInTheDocument();

    const rotulos = screen
      .getAllByRole('option')
      .map((o) => o.textContent ?? '')
      .filter((t) => /SABESP|DAEE|Sem mantenedor/.test(t));
    expect(rotulos).toEqual(['DAEE (1)', 'SABESP (2)', 'Sem mantenedor (1)']);
  });

  it('escolher um mantenedor pede o filtro dele, e não outro da lista', async () => {
    const { aoMudar, campo } = renderizarDesktop(null);

    await userEvent.selectOptions(campo, 'DAEE');
    expect(aoMudar).toHaveBeenCalledWith({ mantenedor: 'DAEE' });

    // Controle no MESMO campo: um mapeamento que mandasse sempre o mesmo valor
    // passaria no caso de cima.
    await userEvent.selectOptions(campo, 'SABESP');
    expect(aoMudar).toHaveBeenLastCalledWith({ mantenedor: 'SABESP' });
  });

  it('"Sem mantenedor" e "Todos" pedem a ausência e a limpeza, que são filtros diferentes', async () => {
    const { aoMudar, campo } = renderizarDesktop(null);

    await userEvent.selectOptions(campo, 'sem');
    expect(aoMudar).toHaveBeenLastCalledWith({ mantenedor: 'sem' });

    cleanup();
    const comFiltro = renderizarDesktop('SABESP');
    await userEvent.selectOptions(comFiltro.campo, '');
    expect(comFiltro.aoMudar).toHaveBeenLastCalledWith({ mantenedor: null });
  });

  it('o mantenedor do link aparece no campo mesmo antes das facetas chegarem', () => {
    // Mesmo defeito da UGRHI (achado 2 do QA de 22/09/2026): `<select>`
    // controlado com valor sem `<option>` correspondente fica em branco, e a
    // pessoa lê "sem filtro" com o recorte aplicado.
    const { campo } = renderizarDesktop('SABESP', null);
    expect(campo).toHaveValue('SABESP');
    expect(campo).toHaveDisplayValue('SABESP (0)');
  });

  it('o link com outra caixa não duplica a opção, e o campo mostra o nome do cadastro', () => {
    // Controle do caso acima: com os dados prontos a opção marcada já vem
    // semeada pelo domínio com o rótulo do cadastro, então o resgate não pode
    // entrar de novo e oferecer a mesma SABESP duas vezes.
    const facetas = contarFacetas(POSTOS, { mantenedor: ['sabesp'] });
    const { campo } = renderizarDesktop('sabesp', facetas);

    expect(screen.getAllByRole('option', { name: /SABESP/i })).toHaveLength(1);
    expect(campo).toHaveDisplayValue('SABESP (2)');
  });

  it('com filtro ativo o botão de limpar aparece, e sem filtro não', () => {
    renderizarDesktop('SABESP');
    expect(screen.getByRole('button', { name: 'Limpar filtros' })).toBeInTheDocument();

    // Controle com o MESMO componente: o botão só é contagem de filtro ativo, e
    // sem ele um `contarFiltrosAtivos` que ignorasse o mantenedor passaria.
    cleanup();
    renderizarDesktop(null);
    expect(screen.queryByRole('button', { name: 'Limpar filtros' })).not.toBeInTheDocument();
  });
});

describe('celular: o mesmo filtro dentro do painel', () => {
  // O painel é um `<dialog>` fechado: o conteúdo existe no DOM e é INACESSÍVEL
  // por papel enquanto não abre, então abrir é parte da medição. O dublê de
  // `showModal` está em `tests/setup-dom.ts`.
  async function abrirPainel(mantenedor: (typeof ESTADO_PADRAO)['mantenedor']) {
    const aoMudar = vi.fn();
    render(
      <FiltrosCelular
        estado={{ ...ESTADO_PADRAO, mantenedor }}
        facetas={FACETAS}
        totalFiltrado={POSTOS.length}
        aoMudar={aoMudar}
        aoLimpar={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Filtros/ }));
    return aoMudar;
  }

  it('oferece a lista com a contagem e pede o filtro escolhido', async () => {
    const aoMudar = await abrirPainel(null);

    const campo = screen.getByRole('combobox', { name: 'Mantenedor' });
    expect(screen.getByRole('option', { name: 'SABESP (2)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Sem mantenedor (1)' })).toBeInTheDocument();

    await userEvent.selectOptions(campo, 'DAEE');
    expect(aoMudar).toHaveBeenCalledWith({ mantenedor: 'DAEE' });
  });

  it('o mantenedor já escolhido chega marcado no painel', async () => {
    await abrirPainel('DAEE');
    expect(screen.getByRole('combobox', { name: 'Mantenedor' })).toHaveDisplayValue('DAEE (1)');
  });
});
