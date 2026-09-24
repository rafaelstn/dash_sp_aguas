/**
 * Achado 5 do QA da tela Postos (23/09/2026): a falha do SIBH não era anunciada.
 *
 * `ComparativoSibh` mandava os dois tons de aviso para o mesmo `role="status"`.
 * Região `status` é polida: o leitor de tela espera uma pausa da pessoa para
 * falar. Para o tom de atenção isso está certo, porque a mensagem só informa que
 * não há o que comparar, e nada foi pedido. Para o tom de erro está errado: "O
 * SIBH não respondeu" é a RESPOSTA ao clique em "Conferir com o SIBH", e quem
 * navega por teclado com leitor de tela ficava esperando um resultado que nunca
 * era anunciado, com o foco parado no botão.
 *
 * Cliente é órgão público, então WCAG 2.1 AA é obrigação legal e não preferência
 * (4.1.3, mensagem de estado).
 *
 * Os casos são pareados de propósito: um exige `alert` onde houve falha, o outro
 * exige que o `status` continue `status` onde é só informação. Sem o par, uma
 * correção que trocasse tudo para `alert` passaria, e a tela passaria a
 * interromper a leitura em quatro avisos que não são falha de nada.
 */
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ComparativoSibh } from '@/components/features/postos/series/ComparativoSibh';
import type { ResultadoComparativo } from '@/application/use-cases/monitor/comparar-serie-com-sibh';

const SIBH_FORA: ResultadoComparativo = { estado: 'origem_indisponivel', lado: 'sibh' };

const SEM_CORRESPONDENCIA: ResultadoComparativo = {
  estado: 'sem_correspondencia',
  motivo: 'posto_sem_identificador',
};

describe('anúncio da conferência com o SIBH', () => {
  it('anuncia a falha do SIBH, que é resposta a uma ação pedida', () => {
    render(
      <ComparativoSibh comparativo={SIBH_FORA} carregando={false} onComparar={() => {}} />,
    );

    const anuncio = screen.getByRole('alert');
    expect(anuncio).toHaveTextContent('O SIBH não respondeu');
    // O botão de tentar de novo mora DENTRO do anúncio: quem ouve a falha ouve
    // junto o que fazer, sem ter que sair procurando na tela. `within` é o que
    // prova a continência: `screen.getByRole` acharia o botão em qualquer canto
    // da página e a asserção passaria mesmo com o botão fora da região.
    expect(
      within(anuncio).getByRole('button', { name: 'Tentar de novo' }),
    ).toBeInTheDocument();
  });

  it('não interrompe a leitura quando o aviso é só informativo', () => {
    render(
      <ComparativoSibh
        comparativo={SEM_CORRESPONDENCIA}
        carregando={false}
        onComparar={() => {}}
      />,
    );

    // Controle: a ausência de correspondência no SIBH é o achado esperado em
    // boa parte dos postos, e não uma falha. Fica em região polida.
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent(/SIBH/);
  });
});
