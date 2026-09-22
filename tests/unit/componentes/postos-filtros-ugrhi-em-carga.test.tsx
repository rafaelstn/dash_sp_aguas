/**
 * Regressão do achado 2 do QA de 22/09/2026, corrigido no commit 2b392e4.
 *
 * Enquanto `facetas` é `null` (carga da tela, ou banco do órgão fora) a lista de
 * UGRHIs vem vazia. Um `<select>` controlado com `value="7"` e sem `<option>`
 * de valor "7" fica em `selectedIndex = -1`: o campo aparece EM BRANCO com o
 * recorte aplicado, e quem usa leitor de tela ouve "sem seleção" sobre um filtro
 * que está valendo. A opção de resgate existe só para esses dois estados.
 *
 * O caso mede o que a pessoa vê e o que é anunciado (o valor selecionado,
 * nomeado), e não a existência da opção: opção presente e não selecionada
 * deixaria o defeito de pé.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FiltrosDesktop } from '@/components/features/postos/mapa/FiltrosPostos';
import { ESTADO_PADRAO } from '@/components/features/postos/mapa/estado-url';
import {
  contarFacetas,
  type FacetasMapa,
  type PontoMapaPosto,
} from '@/domain/mapa-postos';

import { violacoesEmLinha } from '../../apoio/acessibilidade';

/** UGRHI 7 é a Baixada Santista; o rótulo sai de `mapa/ugrhis.ts`. */
const UGRHI_ESCOLHIDA = 7;
const ROTULO_ESCOLHIDA = '7 Baixada Santista';

function posto(prefixo: string, ugrhi: number): PontoMapaPosto {
  return {
    prefixo,
    nome: `Posto ${prefixo}`,
    lat: -23.9,
    lon: -46.3,
    tipo: 'plu',
    situacao: 'em_operacao',
    transmissao: [],
    vazao: [],
    ugrhi,
    municipio: 'SANTOS',
    uf: 'SP',
    coordenadaSuspeita: false,
  };
}

// As facetas saem de `contarFacetas`, que é quem as produz em produção: fixture
// de faceta escrita à mão diverge do domínio sem ninguém perceber.
const FACETAS_COM_A_ESCOLHIDA = contarFacetas(
  [
    posto('B6-001', 6),
    posto('B6-002', UGRHI_ESCOLHIDA),
    posto('B6-003', UGRHI_ESCOLHIDA),
  ],
  { ugrhi: [UGRHI_ESCOLHIDA] },
);

function renderizar(facetas: FacetasMapa | null) {
  return render(
    <FiltrosDesktop
      estado={{ ...ESTADO_PADRAO, ugrhi: UGRHI_ESCOLHIDA }}
      facetas={facetas}
      totalFiltrado={0}
      aoMudar={vi.fn()}
      aoLimpar={vi.fn()}
    />,
  );
}

describe('select de UGRHI com filtro ativo', () => {
  it('mostra a UGRHI escolhida mesmo sem as facetas terem chegado', async () => {
    const { container } = renderizar(null);

    // Sem a opção de resgate o jsdom cai na primeira opção ("Todas as UGRHIs")
    // e o navegador deixa o campo em branco: os dois dizem à pessoa que não há
    // filtro, e é por isso que a asserção é sobre o que o campo NOMEIA, e não
    // sobre `selectedIndex`, que difere entre os dois.
    const select = screen.getByRole('combobox', { name: 'UGRHI' });
    expect(select).toHaveDisplayValue(`${ROTULO_ESCOLHIDA} (0)`);
    expect(select).toHaveValue(String(UGRHI_ESCOLHIDA));
    expect(await violacoesEmLinha(container)).toEqual([]);
  });

  it('não duplica a opção quando as facetas chegam com ela', () => {
    // Controle: com os dados prontos a opção marcada já vem semeada com total
    // zero pelo domínio, então o resgate não pode entrar de novo e oferecer a
    // mesma UGRHI duas vezes na lista.
    renderizar(FACETAS_COM_A_ESCOLHIDA);

    const select = screen.getByRole('combobox', { name: 'UGRHI' });
    expect(select).toHaveDisplayValue(`${ROTULO_ESCOLHIDA} (2)`);
    expect(
      screen.getAllByRole('option', { name: new RegExp(ROTULO_ESCOLHIDA) }),
    ).toHaveLength(1);
  });

  it('fica em "Todas as UGRHIs" quando nenhuma foi escolhida', () => {
    // Segundo controle: sem filtro ativo o resgate não aparece, e o campo
    // continua marcando a opção neutra em vez de uma UGRHI qualquer.
    render(
      <FiltrosDesktop
        estado={ESTADO_PADRAO}
        facetas={null}
        totalFiltrado={0}
        aoMudar={vi.fn()}
        aoLimpar={vi.fn()}
      />,
    );

    expect(screen.getByRole('combobox', { name: 'UGRHI' })).toHaveDisplayValue(
      'Todas as UGRHIs',
    );
  });
});
