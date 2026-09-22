/**
 * Regressão do achado 5 do QA de 22/09/2026, corrigido no commit 53ef06c.
 *
 * O contador de "Outras redes (SIBH)" era uma região `aria-live` DENTRO do
 * `<label>`, então entrava no nome acessível do checkbox: o controle se chamava
 * "Outras redes (SIBH) carregando" e, terminada a carga, "Outras redes (SIBH)
 * 1.234". Nome de controle não muda sozinho (WCAG 4.1.2 / e-MAG 6.2), e região
 * `aria-live` aninhada em rótulo é tratada de forma inconsistente pelos leitores
 * de tela.
 *
 * O caso mede o NOME ACESSÍVEL nos dois estados, que é o que o defeito mudava.
 * Medir só a posição do `<span>` no DOM aprovaria qualquer marcação nova que
 * voltasse a emendar o número no rótulo por outro caminho (`aria-labelledby`,
 * por exemplo).
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  LegendaMapa,
  type EstadoOutrasRedes,
} from '@/components/features/postos/mapa/LegendaMapa';
import { ESTADO_PADRAO } from '@/components/features/postos/mapa/estado-url';

import { violacoesEmLinha } from '../../apoio/acessibilidade';

const NOME_ESTAVEL = 'Outras redes (SIBH)';

function renderizar(outrasRedes: EstadoOutrasRedes, totalOutrasRedes: number) {
  return render(
    <LegendaMapa
      estado={ESTADO_PADRAO}
      naArea={[]}
      outrasRedes={outrasRedes}
      totalOutrasRedes={totalOutrasRedes}
      aoAlternarOutrasRedes={vi.fn()}
    />,
  );
}

describe('nome acessível do checkbox de outras redes', () => {
  it('não carrega o contador enquanto a camada carrega', () => {
    const { container } = renderizar('carregando', 0);

    expect(screen.getByRole('checkbox')).toHaveAccessibleName(NOME_ESTAVEL);
    // Âncora de presença: o "carregando" está na tela, e mesmo assim fora do
    // nome. Sem esta linha o caso passaria com o contador ausente.
    expect(screen.getByRole('status')).toHaveTextContent('carregando');
    expect(container.querySelector('label')?.textContent).not.toMatch(
      /carregando/,
    );
  });

  it('continua com o mesmo nome depois que a contagem chega', async () => {
    const { container } = renderizar('ligada', 1234);

    expect(screen.getByRole('checkbox')).toHaveAccessibleName(NOME_ESTAVEL);
    expect(screen.getByRole('status')).toHaveTextContent('1.234');
    expect(await violacoesEmLinha(container)).toEqual([]);
  });

  it('continua com o mesmo nome quando a camada falha', () => {
    renderizar('erro', 0);

    expect(screen.getByRole('checkbox')).toHaveAccessibleName(NOME_ESTAVEL);
    expect(screen.getByRole('status')).toHaveTextContent('indisponível');
  });
});
