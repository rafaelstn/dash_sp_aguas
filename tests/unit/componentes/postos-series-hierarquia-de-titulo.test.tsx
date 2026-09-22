/**
 * Regressão do achado 1 do QA de 22/09/2026, corrigido no commit 2b392e4.
 *
 * Dois defeitos distintos moravam no mesmo cabeçalho, e por isso há dois grupos
 * de casos aqui:
 *
 *   1. `PainelSeriesPosto` e `ComparativoSibh` fixavam o nível do próprio
 *      título (h2, h3 e h4) e ignoravam o contexto de quem os montava. Dentro da
 *      gaveta de detalhe do mapa, onde o posto já é um h2, o painel virava irmão
 *      do posto para quem navega por cabeçalhos.
 *   2. O MESMO texto ("Séries históricas de medição") saía como h3 no esqueleto
 *      de carga, desenhado por `DetalhePosto`, e como h2 depois de pronto,
 *      desenhado pelo painel: nível de cabeçalho mudando conforme o estado da
 *      requisição.
 *
 * Cliente é órgão público, então WCAG 1.3.1 e e-MAG 3.5 são obrigação legal, e
 * nada além destes casos impede os dois de voltarem.
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DetalhePosto } from '@/components/features/postos/mapa/DetalhePosto';
import { PainelSeriesPosto } from '@/components/features/postos/series/PainelSeriesPosto';
import type { ResumoSerie } from '@/application/ports/series-medicao-repository';
import type { PontoMapaPosto } from '@/domain/mapa-postos';

import { niveisDosTitulos, violacoesEmLinha } from '../../apoio/acessibilidade';

const TITULO_DAS_SERIES = 'Séries históricas de medição';

const SERIE_DE_CHUVA: ResumoSerie = {
  serie: 'chuva_manual',
  rotulo: 'Chuva (leitura manual)',
  unidade: 'mm',
  unidadeInferida: false,
  criterioDiario: 'soma',
  leituras: 120,
  primeiraData: '2024-01-01',
  ultimaData: '2024-03-31',
  ultimaDataComValor: '2024-03-31',
  leiturasComDataFutura: 0,
  leiturasSemValor: 0,
};

/** Pluviométrico e sem fonte de vazão: no detalhe só a seção de séries busca. */
const PONTO: PontoMapaPosto = {
  prefixo: 'B6-026',
  nome: 'Posto de ensaio',
  lat: -23.9,
  lon: -46.3,
  tipo: 'plu',
  situacao: 'em_operacao',
  transmissao: [],
  vazao: [],
  ugrhi: 7,
  municipio: 'SANTOS',
  uf: 'SP',
  coordenadaSuspeita: false,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('nível do título do painel de séries', () => {
  it('usa o nível que recebe, e não um fixo', () => {
    const { container } = render(
      <PainelSeriesPosto prefixo="B6-026" series={[SERIE_DE_CHUVA]} nivelTitulo={3} />,
    );
    expect(
      screen.getByRole('heading', { name: TITULO_DAS_SERIES }),
    ).toBeInTheDocument();
    expect(niveisDosTitulos(container)).toEqual([3]);
  });

  it('cai no 2 da rota dedicada quando ninguém informa nível', () => {
    // Controle do caso acima: a régua tem de aprovar o legítimo. Em
    // `/postos/[prefixo]` o nome do posto é o h1, então 2 é o certo ali.
    const { container } = render(
      <PainelSeriesPosto prefixo="B6-026" series={[SERIE_DE_CHUVA]} />,
    );
    expect(niveisDosTitulos(container)).toEqual([2]);
  });

  it('aninha histórico, conferência e leituras um nível abaixo do painel', async () => {
    // O `ComparativoSibh` fixava h4. Com o painel em h3 isso passava a ser
    // correto por coincidência, e com o painel em h2 pulava o h3.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ dias: [], comparativo: null }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );
    const { container } = render(
      <PainelSeriesPosto prefixo="B6-026" series={[SERIE_DE_CHUVA]} nivelTitulo={2} />,
    );

    await userEvent.click(
      screen.getByRole('radio', { name: /Chuva \(leitura manual\)/ }),
    );
    await screen.findByRole('heading', { name: 'Conferência com o SIBH' });

    expect(niveisDosTitulos(container)).toEqual([2, 3, 3, 3]);
    expect(await violacoesEmLinha(container)).toEqual([]);
  });
});

describe('o nível do título das séries dentro do detalhe do posto', () => {
  it('não muda entre o esqueleto de carga e o painel pronto', async () => {
    // O executor do `Promise` roda de forma síncrona, então `entregar` já existe
    // na linha seguinte; a afirmação de atribuição evita o `| null`, que o
    // TypeScript estreitaria para `never` no ponto da chamada.
    let entregar!: (series: ResumoSerie[]) => void;
    const resposta = new Promise<Response>((resolve) => {
      entregar = (series) =>
        resolve(
          new Response(JSON.stringify({ series }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        String(url).endsWith('/series')
          ? await resposta
          : new Response('{}', { status: 500 }),
      ),
    );

    render(
      <DetalhePosto
        ponto={PONTO}
        comparacao={{ situacao: 'indisponivel' }}
        aoVoltar={() => {}}
      />,
    );

    // Enquanto carrega, quem desenha o cabeçalho é o `DetalhePosto`.
    const durante = screen.getByRole('heading', { name: TITULO_DAS_SERIES });
    expect(durante.tagName).toBe('H3');

    entregar([SERIE_DE_CHUVA]);

    // Depois de pronto, quem desenha o MESMO texto é o painel.
    await waitFor(() => {
      expect(
        screen.getByRole('radio', { name: /Chuva \(leitura manual\)/ }),
      ).toBeInTheDocument();
    });
    const depois = screen.getByRole('heading', { name: TITULO_DAS_SERIES });
    expect(depois.tagName).toBe(durante.tagName);
  });

  it('fica um nível abaixo do nome do posto, que é o h2 da gaveta', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        String(url).endsWith('/series')
          ? new Response(JSON.stringify({ series: [SERIE_DE_CHUVA] }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          : new Response('{}', { status: 500 }),
      ),
    );

    const { container } = render(
      <DetalhePosto
        ponto={PONTO}
        comparacao={{ situacao: 'indisponivel' }}
        aoVoltar={() => {}}
      />,
    );

    await screen.findByRole('radio', { name: /Chuva \(leitura manual\)/ });
    expect(
      screen.getByRole('heading', { name: 'Posto de ensaio' }).tagName,
    ).toBe('H2');
    expect(niveisDosTitulos(container)).toEqual([2, 3]);
  });
});
