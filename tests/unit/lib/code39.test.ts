import { describe, it, expect } from 'vitest';
import {
  GAP_ENTRE_CARACTERES,
  LARGURA_ESTREITO,
  LARGURA_LARGO,
  ZONA_QUIETA_MODULOS,
  codificarCode39,
  padraoCode39,
} from '@/lib/codigo-barras/code39';

/**
 * Vetores escritos a partir da especificação do Code 39 (ISO/IEC 16388), e não
 * copiados do encoder. Notação da norma, elemento a elemento, barra e espaço
 * alternados começando por barra: B = barra larga, b = barra estreita,
 * W = espaço largo, w = espaço estreito.
 */
const VETORES_DA_NORMA: Record<string, string> = {
  '*': 'bWbwBwBwb',
  '0': 'bwbWBwBwb',
  A: 'BwbwbWbwB',
  '-': 'bWbwbwBwB',
};

function notacaoParaBinario(notacao: string): string {
  return [...notacao].map((c) => (c === 'B' || c === 'W' ? '1' : '0')).join('');
}

/**
 * Derivação independente da tabela pela regra de construção da norma: as 5
 * barras formam um código "2 de 5" com pesos 1, 2, 4, 7 e 0 (soma 11 vale 10),
 * e a posição do único espaço largo escolhe o grupo. Os quatro caracteres
 * `$ / + %` não têm barra larga e têm três espaços largos (o estreito indica
 * qual deles é).
 */
const GRUPOS_POR_ESPACO_LARGO: Record<number, string> = {
  0: 'UVWXYZ-. *',
  1: '1234567890',
  2: 'ABCDEFGHIJ',
  3: 'KLMNOPQRST',
};
const PESOS_BARRAS = [1, 2, 4, 7, 0];
const SEM_BARRA_LARGA: Record<number, string> = { 3: '$', 2: '/', 1: '+', 0: '%' };

function caractereDoPadrao(padrao: string): string | null {
  const barras = [0, 2, 4, 6, 8].map((i) => padrao[i]);
  const espacos = [1, 3, 5, 7].map((i) => padrao[i]);
  const largas = barras.flatMap((b, i) => (b === '1' ? [i] : []));
  const espacosLargos = espacos.flatMap((s, i) => (s === '1' ? [i] : []));
  if (largas.length === 2 && espacosLargos.length === 1) {
    const soma = largas.reduce((acc, i) => acc + (PESOS_BARRAS[i] ?? 0), 0);
    const valor = soma === 11 ? 10 : soma;
    return GRUPOS_POR_ESPACO_LARGO[espacosLargos[0] as number]?.[valor - 1] ?? null;
  }
  if (largas.length === 0 && espacosLargos.length === 3) {
    const estreito = [0, 1, 2, 3].find((i) => !espacosLargos.includes(i)) as number;
    return SEM_BARRA_LARGA[estreito] ?? null;
  }
  return null;
}

const CONJUNTO = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%*';

describe('padraoCode39', () => {
  it.each(Object.entries(VETORES_DA_NORMA))('"%s" confere com a norma', (c, notacao) => {
    expect(padraoCode39(c)).toBe(notacaoParaBinario(notacao));
  });

  it('todos os 44 caracteres batem com a regra de construção da norma', () => {
    for (const c of CONJUNTO) {
      const padrao = padraoCode39(c);
      expect(padrao, `padrão de "${c}"`).not.toBeNull();
      expect(padrao).toHaveLength(9);
      expect([...(padrao as string)].filter((e) => e === '1')).toHaveLength(3);
      expect(caractereDoPadrao(padrao as string), `regra para "${c}"`).toBe(c);
    }
  });

  it('a regra derivada reprova um padrão trocado (a régua não aprova tudo)', () => {
    // Padrão do "A" atribuído a "B" tem que ser lido como "A".
    expect(caractereDoPadrao(notacaoParaBinario('BwbwbWbwB'))).toBe('A');
    expect(caractereDoPadrao('000000000')).toBeNull();
  });

  it('minúscula e caractere fora do conjunto não têm padrão', () => {
    expect(padraoCode39('a')).toBeNull();
    expect(padraoCode39('ç')).toBeNull();
    expect(padraoCode39('@')).toBeNull();
    expect(padraoCode39('toString')).toBeNull();
  });
});

describe('codificarCode39', () => {
  it('normaliza para maiúsculas, como o leitor devolve', () => {
    const r = codificarCode39('001SPA26Arara');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.texto).toBe('001SPA26ARARA');
  });

  it('gera start e stop, gap entre caracteres e zona quieta', () => {
    const r = codificarCode39('A');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // "*A*": 3 caracteres, 5 barras cada.
    expect(r.barras).toHaveLength(15);
    const larguraCaractere = 6 * LARGURA_ESTREITO + 3 * LARGURA_LARGO;
    expect(r.larguraModulos).toBe(
      2 * ZONA_QUIETA_MODULOS + 3 * larguraCaractere + 2 * GAP_ENTRE_CARACTERES,
    );
    // Primeira barra começa depois da zona quieta; última termina antes dela.
    expect(r.barras[0]?.x).toBe(ZONA_QUIETA_MODULOS);
    const ultima = r.barras[r.barras.length - 1];
    expect((ultima?.x ?? 0) + (ultima?.largura ?? 0)).toBe(r.larguraModulos - ZONA_QUIETA_MODULOS);
    // Start "*" = bWbwBwBwb: barras estreita, estreita, larga, larga, estreita.
    expect(r.barras.slice(0, 5).map((b) => b.largura)).toEqual([1, 1, 3, 3, 1]);
    // Todo x e largura em módulo inteiro (nitidez).
    expect(r.barras.every((b) => Number.isInteger(b.x) && Number.isInteger(b.largura))).toBe(true);
  });

  it('reconstrói o texto a partir das barras e espaços gerados', () => {
    const r = codificarCode39('1SPA26PENHA');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Reconstroi a sequência de elementos (barra, espaço, ...) a partir da geometria.
    const elementos: number[] = [];
    r.barras.forEach((b, i) => {
      const anterior = r.barras[i - 1];
      if (anterior) elementos.push(b.x - (anterior.x + anterior.largura));
      elementos.push(b.largura);
    });
    const lidos: string[] = [];
    // 9 elementos por caractere, mais 1 gap entre caracteres.
    for (let i = 0; i < elementos.length; i += 10) {
      const padrao = elementos
        .slice(i, i + 9)
        .map((w) => (w === LARGURA_LARGO ? '1' : '0'))
        .join('');
      lidos.push(caractereDoPadrao(padrao) ?? '?');
      if (i + 9 < elementos.length) expect(elementos[i + 9]).toBe(GAP_ENTRE_CARACTERES);
    }
    expect(lidos.join('')).toBe('*1SPA26PENHA*');
  });

  it.each(['çodigo', 'PAT@1', 'A*B', 'a_b'])('recusa "%s" com o caractere culpado', (texto) => {
    const r = codificarCode39(texto);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.erro).toBe('caractere_invalido');
      expect(r.caractere).toBeDefined();
    }
  });

  it('recusa texto vazio', () => {
    expect(codificarCode39('')).toEqual({ ok: false, erro: 'vazio' });
    expect(codificarCode39('   ')).toEqual({ ok: false, erro: 'vazio' });
  });
});
