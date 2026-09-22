/**
 * Regressão do achado 2 do QA de 22/09/2026.
 *
 * A tela de postos tem várias requisições, e todas as outras nascem no corpo de
 * um `useEffect`, que cancela no `return`. A carga do catálogo de estações do
 * SIBH é a exceção: ela nasce de INTERAÇÃO (ligar a camada "outras redes", ou
 * abrir um posto pluviométrico), mora num `useCallback` e não tinha
 * `AbortController` nenhum. Quem abria a tela e saía deixava a conexão ocupada
 * com a resposta mais pesada da tela, para ninguém ler, e o `then` ainda
 * escrevia estado num componente que já tinha saído, que no React 19 é silêncio.
 *
 * O caso mede o EFEITO pelo sinal que o `fetch` recebeu: depois da saída, ele
 * está abortado. Medir a existência de um `AbortController` no código seria
 * medir a forma, e um controlador criado e nunca abortado passaria igual.
 *
 * O controle da mesma régua vem depois: com a tela de pé a carga completa e o
 * botão de comparar chuva fica utilizável. Sem ele, "abortar sempre" passaria
 * aqui e quebraria a funcionalidade inteira.
 */
import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TelaPostos } from '@/components/features/postos/mapa/TelaPostos';
import { contarFacetas, type PontoMapaPosto } from '@/domain/mapa-postos';
import type { Estacao } from '@/components/features/monitor/tipos';

import { renderizarComUrl } from '../../apoio/renderizar';

const PREFIXO = 'D4-013';

const POSTO: PontoMapaPosto = {
  prefixo: PREFIXO,
  nome: 'Posto de teste',
  lat: -23.5,
  lon: -46.6,
  // Pluviométrico de propósito: é o tipo que faz a tela pedir as estações ao
  // abrir o posto, que é o gatilho medido aqui.
  tipo: 'plu',
  situacao: 'em_operacao',
  transmissao: [],
  vazao: [],
  ugrhi: 6,
  municipio: 'SAO PAULO',
  uf: 'SP',
  coordenadaSuspeita: false,
};

const ESTACAO: Estacao = {
  id: 'sibh-1',
  prefixo: PREFIXO,
  nome: 'Estação de teste',
  lat: -23.5,
  lng: -46.6,
  tipo: 'manual',
  tipoEstacao: 'pluviometrico',
  bacia: null,
  owner: null,
  vinculadoAPosto: true,
  sibhId: null,
  criadoEm: '2024-01-01T00:00:00.000Z',
  online: true,
  ultimaTransmissao: null,
};

/** Resposta de `/api/postos/mapa`, com as facetas vindas do domínio. */
const MAPA = {
  total: 1,
  semCoordenada: 0,
  pontos: [POSTO],
  facetas: contarFacetas([POSTO], {}),
};

function resposta(corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * O que o teste guarda da carga das estações: o sinal que o `fetch` recebeu e a
 * chave que libera a resposta.
 *
 * O sinal é tomado do que a APLICAÇÃO passou. Um controlador criado pelo teste
 * seria outro objeto, e aprovaria qualquer coisa.
 */
let sinal: AbortSignal | undefined;
let responder: (() => void) | undefined;

beforeEach(() => {
  sinal = undefined;
  responder = undefined;

  vi.stubGlobal(
    'fetch',
    vi.fn((entrada: RequestInfo | URL, init?: RequestInit) => {
      const url = String(entrada);
      if (url.startsWith('/api/postos/mapa')) return Promise.resolve(resposta(MAPA));
      if (url.startsWith('/api/monitor/estacoes')) {
        sinal = init?.signal ?? undefined;
        // Fica pendente até o teste responder ou o sinal abortar, que é o que
        // uma requisição de verdade faz enquanto a rede não volta.
        return new Promise<Response>((resolveu, rejeitou) => {
          responder = () => resolveu(resposta({ itens: [ESTACAO] }));
          init?.signal?.addEventListener('abort', () =>
            rejeitou(new DOMException('Aborted', 'AbortError')),
          );
        });
      }
      return Promise.resolve(new Response('null', { status: 404 }));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Abre a tela já com o posto pluviométrico selecionado, e espera a carga sair. */
async function telaComOPostoAberto() {
  const resultado = renderizarComUrl(<TelaPostos />, `posto=${PREFIXO}`);

  // Âncora de presença: o botão existe e está esperando a carga. Sem ela o caso
  // passaria com a requisição das estações nunca tendo sido feita, e um sinal
  // abortado por não existir.
  const botao = await screen.findByRole('button', { name: 'Comparar chuva' });
  expect(botao).toBeDisabled();
  expect(sinal, 'a tela não pediu o catálogo de estações').toBeDefined();
  expect(sinal?.aborted).toBe(false);

  return resultado;
}

describe('carga do catálogo de estações ao sair da tela', () => {
  it('cancela a requisição em curso', async () => {
    const { unmount } = await telaComOPostoAberto();

    unmount();

    expect(sinal?.aborted).toBe(true);
  });

  it('com a tela de pé, a carga completa e o botão fica utilizável', async () => {
    // Controle: a régua tem de aprovar o legítimo. Cancelar cedo demais, ou
    // cancelar sempre, deixa o botão preso em "carregando" para sempre.
    await telaComOPostoAberto();

    responder?.();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Comparar chuva' })).toBeEnabled();
    });
    expect(sinal?.aborted).toBe(false);
  });
});
