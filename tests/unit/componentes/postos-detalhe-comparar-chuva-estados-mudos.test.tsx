/**
 * Achado do Rafael em 23/09/2026: o botão "Comparar chuva" do detalhe do
 * posto desaparecia sem dizer nada em três situações diferentes, e só uma
 * delas era correta (posto sem série de chuva). As outras duas, origem do
 * SIBH fora do ar (`/api/monitor/estacoes` em erro) e posto pluviométrico sem
 * estação correspondente em `chuvaPorPrefixo`, caíam no mesmo estado
 * `indisponivel`, mudo, e contradiziam o que `docs/roteiro-demo-gestores.md`
 * promete ao gestor: distinguir ausência de dado de indisponibilidade da
 * fonte e informar qual é o caso.
 *
 * `ComparacaoChuva` ganhou os estados `sem-estacao` e `origem-indisponivel`;
 * `nao-se-aplica` é o único que continua sem nada na tela, porque ali não há
 * o que comparar.
 *
 * `DetalhePosto` sempre busca `/api/monitor/postos/<prefixo>/series` ao
 * montar, então o fetch global é sempre um dublê aqui, mesmo quando o caso em
 * teste não tem nada a ver com séries. A resposta é sempre uma lista vazia e
 * bem-sucedida: com uma falha ali, `SecaoSeries` também desenha um botão
 * "Tentar de novo", que colidiria com o da comparação de chuva.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DetalhePosto } from '@/components/features/postos/mapa/DetalhePosto';
import type { PontoMapaPosto } from '@/domain/mapa-postos';
import type { Estacao } from '@/components/features/monitor/tipos';

const TEXTO_SEM_ESTACAO = 'Sem estação de chuva do SIBH para comparar.';
const TEXTO_ORIGEM_INDISPONIVEL = 'Não foi possível verificar a comparação de chuva.';

function ponto(tipo: PontoMapaPosto['tipo']): PontoMapaPosto {
  return {
    prefixo: 'D4-018',
    nome: 'Posto de ensaio',
    lat: -23.5,
    lon: -46.6,
    tipo,
    situacao: 'em_operacao',
    transmissao: [],
    vazao: [],
    ugrhi: 6,
    municipio: 'SÃO PAULO',
    uf: 'SP',
    coordenadaSuspeita: false,
  };
}

const ESTACAO: Estacao = {
  id: 'e1',
  prefixo: 'D4-018',
  nome: 'Posto de ensaio',
  lat: -23.5,
  lng: -46.6,
  tipo: 'automatico',
  tipoEstacao: 'pluviometrico',
  bacia: null,
  owner: null,
  vinculadoAPosto: true,
  sibhId: 's1',
  criadoEm: '2024-01-01T00:00:00.000Z',
  online: true,
  ultimaTransmissao: '2024-01-01T00:00:00.000Z',
};

/** Sempre presente: `DetalhePosto` busca as séries ao montar. */
function comFetchNeutro() {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(JSON.stringify({ series: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function botaoComparar() {
  return screen.queryByRole('button', { name: /Comparar chuva|Na comparação de chuva/ });
}

describe('botão "Comparar chuva" nos casos antes mudos', () => {
  it('fica ausente e sem texto quando o posto não tem série de chuva (não se aplica)', () => {
    comFetchNeutro();
    render(
      <DetalhePosto ponto={ponto('flu')} comparacao={{ situacao: 'nao-se-aplica' }} aoVoltar={() => {}} />,
    );

    expect(botaoComparar()).toBeNull();
    expect(screen.queryByText(TEXTO_SEM_ESTACAO)).toBeNull();
    expect(screen.queryByText(TEXTO_ORIGEM_INDISPONIVEL)).toBeNull();
  });

  it('avisa que não há estação do SIBH quando o posto pluviométrico não tem uma correspondente', () => {
    comFetchNeutro();
    render(
      <DetalhePosto ponto={ponto('plu')} comparacao={{ situacao: 'sem-estacao' }} aoVoltar={() => {}} />,
    );

    expect(screen.getByText(TEXTO_SEM_ESTACAO)).toBeInTheDocument();
    expect(botaoComparar()).toBeNull();
  });

  it('avisa que a origem falhou, e não que falta estação, quando /api/monitor/estacoes deu erro, e a ação chama o retentar recebido', async () => {
    comFetchNeutro();
    const tentarDeNovo = vi.fn();
    render(
      <DetalhePosto
        ponto={ponto('plu')}
        comparacao={{ situacao: 'origem-indisponivel', tentarDeNovo }}
        aoVoltar={() => {}}
      />,
    );

    expect(screen.getByText(TEXTO_ORIGEM_INDISPONIVEL)).toBeInTheDocument();
    expect(screen.queryByText(TEXTO_SEM_ESTACAO)).toBeNull();
    expect(botaoComparar()).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(tentarDeNovo).toHaveBeenCalledTimes(1);
  });

  it('mantém o botão de comparar quando a estação está pronta (controle do que já funcionava)', () => {
    comFetchNeutro();
    render(
      <DetalhePosto
        ponto={ponto('plu')}
        comparacao={{
          situacao: 'pronta',
          estacao: ESTACAO,
          naCesta: false,
          podeAdicionar: true,
          alternar: () => {},
        }}
        aoVoltar={() => {}}
      />,
    );

    expect(screen.getByRole('button', { name: 'Comparar chuva' })).toBeInTheDocument();
    expect(screen.queryByText(TEXTO_SEM_ESTACAO)).toBeNull();
    expect(screen.queryByText(TEXTO_ORIGEM_INDISPONIVEL)).toBeNull();
  });
});
