/**
 * A paleta do mapa diz a mesma cor que o `globals.css`.
 *
 * Por que esta régua existe: o mapa desenha os postos em canvas, e
 * `ctx.fillStyle` não resolve `var(--posto-plu)`. O canvas precisa do
 * hexadecimal resolvido, então existe uma cópia em `paleta-mapa.ts`. Cópia sem
 * régua diverge calada, e a cor do mapa de um painel de governo é a cor que
 * carrega o contraste declarado na entrega: quem mudar o token no CSS e
 * esquecer a cópia (ou o contrário) falha aqui.
 *
 * O aparelho se prova primeiro, contra um CSS sintético que mente de propósito:
 * régua nova é suspeita até reprovar o defeito E aprovar o legítimo.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { TOKENS_DO_MAPA, COR, comAlfa } from '@/components/features/postos/mapa/paleta-mapa';

import { hexParaRgb, hslParaRgb, rgbParaHex } from '../../apoio/cor';

const CAMINHO_CSS = path.join(process.cwd(), 'src', 'styles', 'globals.css');

/** Pega qualquer token no formato `--nome: H S% L%;`, com ou sem comentário ao lado. */
function hexQueOTokenRenderiza(css: string, token: string): string | null {
  const nome = token.replace(/^--/, '');
  const achado = new RegExp(
    `^\\s*--${nome}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%\\s*;`,
    'm',
  ).exec(css);
  if (!achado) return null;
  const [, h, s, l] = achado;
  if (h === undefined || s === undefined || l === undefined) return null;
  return rgbParaHex(hslParaRgb(Number.parseFloat(h), Number.parseFloat(s), Number.parseFloat(l)));
}

function lerCss(): string {
  const css = readFileSync(CAMINHO_CSS, 'utf8');
  // Piso contra leitura vazia: régua que lê nada aprova tudo.
  expect(css.length, `o globals.css lido em ${CAMINHO_CSS} veio pequeno demais`).toBeGreaterThan(
    2000,
  );
  return css;
}

describe('o aparelho que lê token do CSS', () => {
  it('devolve a cor que o HSL da linha renderiza', () => {
    expect(hexQueOTokenRenderiza('    --posto-plu: 211.6 63.9% 40.2%; /* #2563A8 */', '--posto-plu')).toBe(
      '#2563A8',
    );
    expect(hexQueOTokenRenderiza('    --bg-surface: 0 0% 100%;  /* branco */', '--bg-surface')).toBe(
      '#FFFFFF',
    );
  });

  it('devolve null quando o token não está no arquivo', () => {
    expect(hexQueOTokenRenderiza('    --posto-plu: 0 0% 0%;', '--posto-inexistente')).toBeNull();
  });

  it('não confunde um token com outro de nome mais longo', () => {
    // `--posto-plu` não pode casar na linha de `--posto-pluviometrico-antigo`.
    expect(hexQueOTokenRenderiza('    --posto-pluviometrico-antigo: 0 0% 0%;', '--posto-plu')).toBeNull();
  });

  it('reprova a paleta quando o CSS declara outra cor', () => {
    // Matiz trocado de 211.6 para 240: mesma família, cor diferente.
    const mentiroso = '    --posto-plu: 240 63.9% 40.2%;   /* #2563A8 */';
    expect(hexQueOTokenRenderiza(mentiroso, '--posto-plu')).not.toBe(COR.plu);
  });
});

describe('a paleta do mapa', () => {
  const css = lerCss();

  it('tem todas as cores que o mapa desenha', () => {
    // Piso: alguém que esvaziar a tabela deixaria as asserções abaixo medindo
    // conjunto vazio, e a régua aprovaria o nada.
    expect(Object.keys(TOKENS_DO_MAPA).length).toBeGreaterThanOrEqual(14);
    expect(Object.keys(COR).length).toBe(Object.keys(TOKENS_DO_MAPA).length);
  });

  it('aponta para token que existe no globals.css', () => {
    const ausentes = Object.entries(TOKENS_DO_MAPA)
      .filter(([, [token]]) => hexQueOTokenRenderiza(css, token) === null)
      .map(([nome, [token]]) => `${nome} -> ${token}`);
    expect(ausentes, `tokens citados pela paleta e ausentes do globals.css:\n${ausentes.join('\n')}`).toEqual(
      [],
    );
  });

  it('declara exatamente a cor que o token renderiza', () => {
    const divergem = Object.entries(TOKENS_DO_MAPA)
      .map(([nome, [token, hex]]) => ({ nome, token, hex, real: hexQueOTokenRenderiza(css, token) }))
      .filter(({ hex, real }) => real !== null && real !== hex)
      .map(({ nome, token, hex, real }) => `${nome}: ${token} renderiza ${real}, a paleta diz ${hex}`);
    expect(divergem, `cores que divergem do globals.css:\n${divergem.join('\n')}`).toEqual([]);
  });
});

describe('comAlfa', () => {
  it('converte o hexadecimal da paleta em rgba utilizável no canvas', () => {
    expect(comAlfa(COR.realce, 0.16)).toBe('rgba(17, 24, 39, 0.16)');
    expect(comAlfa('#FFFFFF', 1)).toBe('rgba(255, 255, 255, 1)');
  });

  it('bate com a conversão do aparelho de cor, canal por canal', () => {
    const { r, g, b } = hexParaRgb(COR.plu);
    expect(comAlfa(COR.plu, 0.5)).toBe(`rgba(${r}, ${g}, ${b}, 0.5)`);
  });
});
