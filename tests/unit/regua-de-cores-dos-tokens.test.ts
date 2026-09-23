/**
 * Os comentários dos tokens de cor contam a verdade sobre os próprios tokens.
 *
 * Medido em 23/09/2026, antes desta régua existir: em 23 dos 38 tokens que
 * citam um hexadecimal, o HSL escrito à mão NÃO renderizava aquela cor, e em 6
 * o ratio de contraste declarado não era o que o par de cores entrega. Os
 * piores erravam 9, 10 e 11 de um canal, e `--status-warn` prometia 7.4:1
 * entregando 6.53:1. Nada disso caía abaixo de AA, então nenhuma ferramenta
 * reclamava: lint, typecheck, build e a suíte ficavam verdes sobre um arquivo
 * que documentava a cor errada. Num painel de governo o ratio não é enfeite, é
 * o número que sustenta a conformidade declarada na entrega.
 *
 * Régua nova é suspeita até reprovar o defeito E aprovar o legítimo, então este
 * arquivo prova primeiro o aparelho (conversão e contraste contra valores que
 * não dependem desta implementação, e um CSS sintético que mente de propósito),
 * e só depois julga o `globals.css`.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  contraste,
  deltaMaximo,
  hexParaRgb,
  hslParaRgb,
  rgbParaHex,
  tokensDeCor,
  type TokenDeCor,
} from '../apoio/cor';

const BRANCO = { r: 255, g: 255, b: 255 };

/**
 * Fundos que os comentários citam pelo nome, para o ratio ser conferido contra
 * a cor certa e não sempre contra branco. Os `bg-*-50` são do Tailwind e a
 * zebra é o próprio `--bg-surface-3` declarado no arquivo.
 */
const FUNDOS = {
  branco: '#FFFFFF',
  zebra: '#E5E7EB',
  'bg-red-50': '#FEF2F2',
  'bg-emerald-50': '#ECFDF5',
  'bg-amber-50': '#FFFBEB',
} as const;

type NomeDeFundo = keyof typeof FUNDOS;

/** O comentário arredonda o ratio para uma decimal. */
const TOLERANCIA_DO_RATIO = 0.15;

const CAMINHO_CSS = path.join(process.cwd(), 'src', 'styles', 'globals.css');

/**
 * Extrai de um CSS sintético o único token que ele deveria ter.
 *
 * Existência antes de forma: se a extração vier vazia, a asserção seguinte
 * mediria `undefined` e passaria por acidente.
 */
function umTokenDe(css: string): TokenDeCor {
  const achados = tokensDeCor(css);
  expect(achados, `nada extraído de: ${css}`).toHaveLength(1);
  const [token] = achados;
  if (!token) throw new Error(`nada extraído de: ${css}`);
  return token;
}

function lerCssDoProjeto(): string {
  const css = readFileSync(CAMINHO_CSS, 'utf8');
  // Piso contra leitura vazia: uma régua que lê nada aprova tudo.
  expect(
    css.length,
    `o globals.css lido em ${CAMINHO_CSS} veio pequeno demais para ser o arquivo real`,
  ).toBeGreaterThan(2000);
  return css;
}

describe('o aparelho que mede cor', () => {
  it('converte hsl() como o navegador, nas cores nomeadas do Tailwind', () => {
    // Hexadecimais publicados pelo Tailwind, com o HSL que o próprio
    // globals.css usa. Se a conversão estiver errada, erra aqui primeiro.
    expect(rgbParaHex(hslParaRgb(221, 39, 11))).toBe('#111827'); // gray-900
    expect(rgbParaHex(hslParaRgb(215, 14, 34))).toBe('#4B5563'); // gray-600
    expect(rgbParaHex(hslParaRgb(22.7, 82.5, 31.4))).toBe('#92400E'); // amber-800
    expect(rgbParaHex(hslParaRgb(0, 0, 100))).toBe('#FFFFFF');
    expect(rgbParaHex(hslParaRgb(0, 0, 0))).toBe('#000000');
  });

  it('dá 21:1 entre branco e preto, e 1:1 de uma cor com ela mesma', () => {
    // 21:1 é o máximo por definição da WCAG, e não depende desta implementação.
    expect(contraste(BRANCO, { r: 0, g: 0, b: 0 })).toBeCloseTo(21, 2);
    expect(contraste(BRANCO, BRANCO)).toBeCloseTo(1, 6);
  });

  it('reprova um CSS sintético em que o comentário mente sobre a cor', () => {
    // Este é o defeito real de `--status-warn` como ele estava no arquivo:
    // HSL de matiz 28 com o hexadecimal do amber-800, que é matiz 22.7.
    const token = umTokenDe('    --status-warn: 28 84% 31%; /* #92400E, 7.4:1 branco */');
    expect(token.hexCitado).toBe('#92400E');
    expect(deltaMaximo(hslParaRgb(28, 84, 31), hexParaRgb('#92400E'))).toBe(11);
    expect(contraste(hslParaRgb(28, 84, 31), BRANCO)).toBeLessThan(7.4 - TOLERANCIA_DO_RATIO);
  });

  it('enxerga o token, o hexadecimal e os dois ratios de uma linha', () => {
    const token = umTokenDe(
      '    --status-danger: 0 70% 35.3%;    /* #991B1B, 8.3:1 branco, 7.6:1 sobre bg-red-50 */',
    );
    expect(token.nome).toBe('status-danger');
    expect(token.hsl).toEqual({ h: 0, s: 70, l: 35.3 });
    expect(token.hexCitado).toBe('#991B1B');
    expect(token.ratiosCitados).toEqual([8.3, 7.6]);
  });

  it('ignora a linha que não declara cor, e a que não cita hexadecimal', () => {
    const css = [
      '    --ring: var(--gov-azul);',
      '    --row-h-compact: 32px;',
      '    --bg-surface: 0 0% 100%;         /* branco — cards, tabela */',
      '    --sibh-rio: 201 100% 70%;        /* faixa do rio #66c9ff */',
    ].join('\n');
    expect(tokensDeCor(css).map((t) => t.nome)).toEqual(['sibh-rio']);
  });
});

describe('os tokens de cor do globals.css', () => {
  const tokens = tokensDeCor(lerCssDoProjeto());

  it('tem a quantidade de tokens com cor declarada que o arquivo promete', () => {
    // Piso, não teto: se a contagem cair, alguém apagou a declaração ou o
    // comentário, e a régua deixaria de medir em silêncio.
    expect(tokens.length).toBeGreaterThanOrEqual(38);
  });

  it('renderiza exatamente o hexadecimal que cada comentário declara', () => {
    const mentem = tokens
      .filter(({ hsl, hexCitado }) => deltaMaximo(hslParaRgb(hsl.h, hsl.s, hsl.l), hexParaRgb(hexCitado)) > 0)
      .map(({ nome, linha, hsl, hexCitado }) => {
        const real = rgbParaHex(hslParaRgb(hsl.h, hsl.s, hsl.l));
        return `L${linha} --${nome}: renderiza ${real}, comentário diz ${hexCitado}`;
      });
    // Tolerância zero: todo hexadecimal do arquivo tem um HSL que o devolve,
    // bastando a casa decimal (medido nos 38). Delta 1 ainda é comentário que
    // mente, e em cor de fidelidade ao SIBH a diferença é com o painel do órgão.
    expect(mentem, `tokens cujo HSL não é a cor declarada:\n${mentem.join('\n')}`).toEqual([]);
  });

  it('entrega o ratio de contraste que cada comentário promete', () => {
    const errados: string[] = [];
    for (const { nome, linha, hsl, ratiosCitados, comentario } of tokens) {
      if (ratiosCitados.length === 0) continue;
      const cor = hslParaRgb(hsl.h, hsl.s, hsl.l);
      // O primeiro ratio é sobre branco (o cabeçalho da seção semântica diz
      // isso); os seguintes citam o fundo pelo nome, na ordem em que aparecem.
      const nomesDeFundo: NomeDeFundo[] = [
        'branco',
        ...(Object.keys(FUNDOS) as NomeDeFundo[]).filter(
          (f) => f !== 'branco' && comentario.includes(f),
        ),
      ];
      ratiosCitados.forEach((citado, i) => {
        const nomeDoFundo = nomesDeFundo[i] ?? 'branco';
        const real = contraste(cor, hexParaRgb(FUNDOS[nomeDoFundo]));
        if (Math.abs(real - citado) > TOLERANCIA_DO_RATIO) {
          errados.push(
            `L${linha} --${nome}: ${real.toFixed(2)}:1 sobre ${nomeDoFundo}, comentário diz ${citado}:1`,
          );
        }
      });
    }
    expect(errados, `ratios que o token não entrega:\n${errados.join('\n')}`).toEqual([]);
  });

  it('mantém AA para os tokens de texto e de status sobre branco', () => {
    // O que a régua acima NÃO cobre: um token pode bater com o comentário e
    // ainda assim ser escuro de menos. 4.5:1 é o mínimo da WCAG 1.4.3 para
    // texto normal, e estes tokens são usados em texto.
    const deTexto = ['fg-default', 'fg-muted', 'fg-subtle', 'status-danger', 'status-success', 'status-warn'];
    const fracos = tokens
      .filter((t) => deTexto.includes(t.nome))
      .map((t) => ({ nome: t.nome, ratio: contraste(hslParaRgb(t.hsl.h, t.hsl.s, t.hsl.l), BRANCO) }))
      .filter((t) => t.ratio < 4.5)
      .map((t) => `--${t.nome}: ${t.ratio.toFixed(2)}:1`);
    expect(fracos, `tokens de texto abaixo de 4.5:1 sobre branco:\n${fracos.join('\n')}`).toEqual([]);
    // E a lista tem que ter achado os seis: nome trocado no CSS sem trocar aqui
    // deixaria a asserção acima medindo um conjunto vazio.
    expect(tokens.filter((t) => deTexto.includes(t.nome))).toHaveLength(deTexto.length);
  });
});
