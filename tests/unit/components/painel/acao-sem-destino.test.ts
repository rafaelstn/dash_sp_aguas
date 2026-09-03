/**
 * Nenhum cartão de KPI promete uma ação que não leva a lugar nenhum.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUE ISTO É GUARDA, E NÃO REVISÃO DE CÓDIGO
 * ─────────────────────────────────────────────────────────────────────────
 * O painel carregava `rotuloAcao="Rodar worker"` num cartão SEM `href` desde
 * que o cartão existe. O rótulo nunca chegou à tela, porque o `CardKPI` só
 * desenha a linha de ação quando há destino — ou seja, o defeito não aparecia
 * em captura, em teste nem em exit code nenhum. Ele ficava esperando alguém
 * ligar um `href`, e aí a tela passaria a oferecer ao gestor um botão para
 * rodar um indexador que a imagem do órgão nem contém (runbook §9.3).
 *
 * A varredura é pela MARCA do componente em todo o `src`, e não por uma lista
 * de páginas: cartão novo em pasta nova entra na conferência sozinho, que é
 * exatamente o que uma lista não faz.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = path.resolve(__dirname, '..', '..', '..', '..');
const SRC = path.join(RAIZ, 'src');

function arquivosTsx(dir: string): string[] {
  const achados: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const completo = path.join(dir, entrada);
    if (statSync(completo).isDirectory()) {
      achados.push(...arquivosTsx(completo));
    } else if (entrada.endsWith('.tsx')) {
      achados.push(completo);
    }
  }
  return achados;
}

interface UsoDeCartao {
  arquivo: string;
  /** Texto do elemento, do `<CardKPI` até o `/>` que o fecha. */
  corpo: string;
}

/**
 * Cada `<CardKPI ... />` do projeto, exceto a definição do próprio componente.
 *
 * O recorte vai da abertura até o primeiro `/>`, o que basta porque estes
 * elementos são autofechados e nenhuma prop deles carrega JSX aninhado. O caso
 * "achei tantos quantos existem" logo abaixo é o que denuncia se isso mudar:
 * sem ele, um elemento truncado sumiria da conferência em silêncio.
 */
function usosDeCartao(): UsoDeCartao[] {
  const usos: UsoDeCartao[] = [];
  for (const arquivo of arquivosTsx(SRC)) {
    if (path.basename(arquivo) === 'CardKPI.tsx') continue;
    const texto = readFileSync(arquivo, 'utf8');
    for (const pedaco of texto.split('<CardKPI').slice(1)) {
      const fim = pedaco.indexOf('/>');
      if (fim === -1) continue;
      usos.push({ arquivo, corpo: pedaco.slice(0, fim) });
    }
  }
  return usos;
}

/** Quantas vezes o componente é instanciado, contado de forma independente. */
function totalDeAberturas(): number {
  let total = 0;
  for (const arquivo of arquivosTsx(SRC)) {
    if (path.basename(arquivo) === 'CardKPI.tsx') continue;
    total += readFileSync(arquivo, 'utf8').split('<CardKPI').length - 1;
  }
  return total;
}

describe('cartão de KPI: rótulo de ação exige destino', () => {
  it('a varredura enxerga cartão, e enxerga TODOS os que existem', () => {
    // Guarda da guarda: se o recorte parar de casar, esta medida cai e o caso
    // de baixo passaria a aprovar um conjunto vazio, verde e sem conferir nada.
    const usos = usosDeCartao();
    expect(usos.length).toBeGreaterThan(0);
    expect(usos.length).toBe(totalDeAberturas());
  });

  it('nenhum cartão traz rotuloAcao sem href', () => {
    const promessasSemDestino = usosDeCartao()
      .filter((u) => u.corpo.includes('rotuloAcao') && !u.corpo.includes('href'))
      .map((u) => {
        const titulo = /titulo="([^"]*)"/.exec(u.corpo)?.[1] ?? '(sem título)';
        return `${path.relative(RAIZ, u.arquivo)} → "${titulo}"`;
      });

    // Nomear o arquivo e o cartão: guarda que só diz "falhou" faz a próxima
    // pessoa remedir tudo à mão.
    expect(promessasSemDestino).toEqual([]);
  });
});
