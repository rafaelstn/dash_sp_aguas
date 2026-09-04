import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * O cartão de telemetria fala de APARELHO INSTALADO, e nunca de transmissão.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUE ISTO PRECISA DE GUARDA, SENDO SÓ UM RÓTULO
 * ─────────────────────────────────────────────────────────────────────────
 * O número vem de `Dbfch`, contando posto com aparelho `PLUVIOMETRO
 * TELEMETRICO` ou `LIMNIGRAFO TELEMETRICO` cujo vínculo não foi desativado.
 * Isso responde "o posto TEM o equipamento", e não "o equipamento está
 * enviando dado".
 *
 * A diferença não é sutil nesta base: **as cinco séries de medição do órgão
 * pararam em agosto de 2025** (`docs/arquitetura/series-de-medicao-dbfch-e-sibh.md`).
 * Um cartão dizendo "149 postos transmitindo" seria uma afirmação que a própria
 * base do cliente contradiz, publicada no painel do gestor daquele cliente.
 *
 * E é uma troca que alguém faz de boa-fé: "Telemetria ativa" e "transmitindo"
 * soam mais informativos que "com telemetria", e o cartão continuaria com o
 * mesmo número, verde, sem nada quebrar. É exatamente o formato de defeito que
 * este painel já teve duas vezes: a frase mudou o significado do número sem
 * mudar o número.
 */

const PAGINA = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'src',
  'app',
  '(dashboard)',
  'painel',
  'page.tsx',
);

const fonte = readFileSync(PAGINA, 'utf-8');

/** Trecho do cartão, isolado para a asserção não varrer a página inteira. */
function blocoDoCartao(): string {
  const i = fonte.indexOf('titulo="Postos com telemetria"');
  expect(i).toBeGreaterThan(-1);
  // Do título até o fim do elemento. O cartão tem menos de 12 linhas.
  return fonte.slice(i, fonte.indexOf('/>', i) + 2);
}

describe('cartão de telemetria', () => {
  it('existe, com o rótulo que descreve equipamento', () => {
    expect(fonte).toContain('titulo="Postos com telemetria"');
  });

  it.each(['transmitindo', 'transmissão', 'Telemetria ativa', 'ativa', 'online'])(
    'não usa a palavra "%s", que afirmaria estado de transmissão',
    (palavra) => {
      expect(blocoDoCartao().toLowerCase()).not.toContain(palavra.toLowerCase());
    },
  );

  it('é `info`, e nunca cor de alarme', () => {
    // São 2,6% da rede. Baixa telemetria é fato de modernização, não
    // irregularidade, e o painel de um órgão público não o acusa de nada.
    expect(blocoDoCartao()).toContain('severidade="info"');
    for (const alarme of ['"alta"', '"critica"', '"crítica"']) {
      expect(blocoDoCartao()).not.toContain(`severidade=${alarme}`);
    }
  });

  it('leva para o filtro que realmente existe', () => {
    // `tem_telem=1` é lido em `app/(dashboard)/page.tsx`. Rótulo de ação com
    // destino inexistente é o defeito que `acao-sem-destino.test.ts` guarda.
    expect(blocoDoCartao()).toContain('href="/?tem_telem=1"');
    const busca = readFileSync(
      path.resolve(__dirname, '..', '..', '..', '..', 'src', 'app', '(dashboard)', 'page.tsx'),
      'utf-8',
    );
    expect(busca).toContain("sp.tem_telem === '1'");
  });
});
