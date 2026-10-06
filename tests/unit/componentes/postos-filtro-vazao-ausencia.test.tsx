/**
 * Negação do filtro de vazão na tela, pedida pelo órgão em 29/09/2026.
 *
 * O domínio já tem o caso que prova a regra e a contagem
 * (`tests/unit/domain/mapa-postos.test.ts`); aqui o que se mede é o que a
 * pessoa vê e consegue escolher, nas DUAS larguras do contrato, porque o
 * desktop e o celular montam as mesmas sete opções com marcação diferente
 * (select com `optgroup` contra radios em dois fieldsets).
 *
 * No celular a asserção é sobre o que o clique PEDE (`aoMudar` com a opção) e
 * sobre quantos radios ficam marcados, nunca sobre a existência deles: opção
 * presente que não muda filtro nenhum deixaria o pedido do órgão de pé.
 *
 * O que esta régua não mede, porque medi e o mutante sobreviveu: o atributo
 * `name` compartilhado pelos dois fieldsets. Os radios são controlados por
 * `estado.vazao`, então trocar o nome não muda nada no que a tela marca; o que
 * ele governa é o percurso por seta do teclado, e isso é comportamento de
 * navegador que o jsdom não reproduz.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  FiltrosCelular,
  FiltrosDesktop,
} from '@/components/features/postos/mapa/FiltrosPostos';
import { ESTADO_PADRAO } from '@/components/features/postos/mapa/estado-url';
import { contarFacetas, type PontoMapaPosto } from '@/domain/mapa-postos';

function posto(prefixo: string, vazao: PontoMapaPosto['vazao']): PontoMapaPosto {
  return {
    prefixo,
    nome: `Posto ${prefixo}`,
    lat: -23.9,
    lon: -46.3,
    tipo: 'flu',
    situacao: 'em_operacao',
    transmissao: [],
    vazao,
    ugrhi: 7,
    municipio: 'SANTOS',
    uf: 'SP',
    mantenedor: null,
    coordenadaSuspeita: false,
  };
}

// Três postos, dos quais um só tem curva-chave: as facetas saem de
// `contarFacetas`, que é quem as produz em produção. Com fixture escrita à mão
// a contagem da tela poderia divergir do domínio sem ninguém perceber.
const FACETAS = contarFacetas(
  [
    posto('B6-001', ['curva', 'medicao']),
    posto('B6-002', ['medicao']),
    posto('B6-003', []),
  ],
  {},
);

describe('desktop: as ausências no select de vazão', () => {
  it('oferece as três ausências com a contagem do domínio, separadas das fontes', () => {
    render(
      <FiltrosDesktop
        estado={ESTADO_PADRAO}
        facetas={FACETAS}
        totalFiltrado={3}
        aoMudar={vi.fn()}
        aoLimpar={vi.fn()}
      />,
    );

    // Dois dos três postos não têm curva-chave, e um tem: o par que fecha o
    // total é o que denuncia faceta de ausência contada errado.
    expect(screen.getByRole('option', { name: 'Sem curva-chave (2)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Com curva-chave (1)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Sem medição de campo (1)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Nenhuma fonte de vazão (1)' })).toBeInTheDocument();

    // O agrupamento é o que separa "Com" de "Sem" na lista. Sem ele as duas
    // opções ficam vizinhas e quem escolhe pelo começo do rótulo erra.
    const grupos = screen
      .getByRole('combobox', { name: 'Vazão' })
      .querySelectorAll('optgroup');
    expect([...grupos].map((g) => g.label)).toEqual(['O posto tem', 'O posto não tem']);
  });

  it('com a ausência escolhida o campo NOMEIA a opção, em vez de ficar em branco', () => {
    render(
      <FiltrosDesktop
        estado={{ ...ESTADO_PADRAO, vazao: 'sem_curva' }}
        facetas={FACETAS}
        totalFiltrado={2}
        aoMudar={vi.fn()}
        aoLimpar={vi.fn()}
      />,
    );

    const select = screen.getByRole('combobox', { name: 'Vazão' });
    expect(select).toHaveValue('sem_curva');
    expect(select).toHaveDisplayValue('Sem curva-chave (2)');
  });
});

// O dublê de `showModal` nasceu aqui e subiu para `tests/setup-dom.ts` em
// 05/10/2026, quando o teste do filtro de mantenedor precisou do mesmo: era o
// que esta nota já previa, e o motivo e os limites dele estão lá.

describe('celular: as ausências são radios do MESMO grupo', () => {
  // O painel do celular é um `<dialog>` fechado: o conteúdo existe no DOM e é
  // INACESSÍVEL, então medir sem abrir acharia os radios por `querySelector` e
  // não acharia nada por papel, que é como a pessoa chega neles. Abrir é parte
  // da medição, e o `aria-pressed` do botão não substitui.
  async function abrirPainel(vazao: (typeof ESTADO_PADRAO)['vazao']) {
    const aoMudar = vi.fn();
    render(
      <FiltrosCelular
        estado={{ ...ESTADO_PADRAO, vazao }}
        facetas={FACETAS}
        totalFiltrado={3}
        aoMudar={aoMudar}
        aoLimpar={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Filtros/ }));
    return aoMudar;
  }

  it('clicar na ausência pede o filtro dela, e não a fonte de mesmo nome', async () => {
    const aoMudar = await abrirPainel(null);

    await userEvent.click(screen.getByRole('radio', { name: /^Sem curva-chave/ }));
    expect(aoMudar).toHaveBeenCalledWith({ vazao: 'sem_curva' });

    // Controle no MESMO painel: a fonte oposta continua pedindo a dela. Sem
    // este par, um mapeamento que mandasse sempre a mesma opção passaria.
    await userEvent.click(screen.getByRole('radio', { name: /^Com curva-chave/ }));
    expect(aoMudar).toHaveBeenLastCalledWith({ vazao: 'curva' });
  });

  it('a ausência escolhida deixa um só radio marcado, com a fonte oposta livre', async () => {
    await abrirPainel('sem_curva');

    const radios = screen.getAllByRole('radio');
    // "Sem filtro" mais as quatro do grupo de cima mais as três ausências.
    expect(radios).toHaveLength(8);
    expect(radios.filter((r) => (r as HTMLInputElement).checked)).toHaveLength(1);
    expect(screen.getByRole('radio', { name: /^Sem curva-chave/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /^Com curva-chave/ })).not.toBeChecked();
  });

  it('controle: escolher a fonte oposta também deixa um só marcado', async () => {
    await abrirPainel('curva');

    expect(screen.getAllByRole('radio').filter((r) => (r as HTMLInputElement).checked)).toHaveLength(1);
    expect(screen.getByRole('radio', { name: /^Com curva-chave/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /^Sem curva-chave/ })).not.toBeChecked();
  });

  it('a ausência aparece com rótulo e contagem, e sob um título que a explica', async () => {
    await abrirPainel(null);

    expect(screen.getByRole('radio', { name: 'Sem curva-chave 2' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Com curva-chave 1' })).toBeInTheDocument();
    expect(screen.getByText('Vazão que o posto não tem')).toBeInTheDocument();
  });
});
