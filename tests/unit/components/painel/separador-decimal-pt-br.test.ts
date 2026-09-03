/**
 * Número com casa decimal seguido de unidade sai em pt-BR, com VÍRGULA.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * O DEFEITO QUE ORIGINOU ESTA GUARDA
 * ─────────────────────────────────────────────────────────────────────────
 * O painel publicava `99.9%` e `5.784 com coordenadas` na mesma linha: o
 * total passava por `toLocaleString('pt-BR')` e o percentual por `toFixed`,
 * que devolve ponto decimal em qualquer idioma. Achado abrindo a tela, com
 * typecheck, lint e a suíte inteira verdes por cima — nenhum deles tem o que
 * dizer sobre separador decimal.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUE A GUARDA OLHA A UNIDADE, E NÃO O `toFixed`
 * ─────────────────────────────────────────────────────────────────────────
 * `toFixed` continua legítimo neste projeto, e o commit 6fed3fd registrou por
 * quê: COORDENADA se lê por convenção técnica com ponto (`-23.550520`), e ano
 * não leva separador de milhar. Proibir a função inteira reprovaria código
 * correto, e guarda que reprova o certo é guarda que alguém desliga.
 *
 * O que denuncia é a COMBINAÇÃO: resultado com casa decimal (`toFixed(1)` ou
 * mais) colado numa unidade de grandeza que o gestor lê (`%`, `km`, `m`).
 * `toFixed(0)` fica de fora de propósito — sem casa decimal não há separador
 * a errar.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatarPercentual } from '@/lib/format';

const RAIZ = path.resolve(__dirname, '..', '..', '..', '..');
const SRC = path.join(RAIZ, 'src');

/**
 * `toFixed(1)` ou mais, fechando interpolação, seguido de unidade.
 *
 * Cobre as quatro formas que o projeto escreve: `${x.toFixed(1)}%`,
 * `{x.toFixed(1)}%`, `${x.toFixed(1)} km` e `{x.toFixed(2)}m`.
 */
const DECIMAL_COM_UNIDADE = /toFixed\(\s*[1-9]\d*\s*\)\s*\}\s*(?:%|km\b|m\b)/;

function arquivosDeTela(dir: string): string[] {
  const achados: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const completo = path.join(dir, entrada);
    if (statSync(completo).isDirectory()) {
      achados.push(...arquivosDeTela(completo));
    } else if (entrada.endsWith('.tsx')) {
      achados.push(completo);
    }
  }
  return achados;
}

describe('formatarPercentual', () => {
  it('usa vírgula e uma casa, que é o que o painel exibe', () => {
    expect(formatarPercentual(99.94)).toBe('99,9%');
    expect(formatarPercentual(100)).toBe('100,0%');
    expect(formatarPercentual(0)).toBe('0,0%');
  });

  it('nunca devolve ponto como separador decimal', () => {
    for (const n of [0.05, 3.14159, 76.28, 99.99, 100]) {
      expect(formatarPercentual(n)).not.toMatch(/\d\.\d/);
    }
  });

  it('não finge número quando não recebe um', () => {
    expect(formatarPercentual(Number.NaN)).not.toMatch(/NaN/);
    expect(formatarPercentual(Number.POSITIVE_INFINITY)).not.toMatch(/∞/);
  });
});

describe('nenhuma tela cola decimal de toFixed numa unidade', () => {
  it('a varredura enxerga arquivo de tela', () => {
    // Sem esta medida, um erro no caminho deixaria a lista vazia e o caso
    // abaixo passaria verde sem ter lido arquivo nenhum.
    expect(arquivosDeTela(SRC).length).toBeGreaterThan(0);
  });

  it('todo percentual e toda distância saem por formatador pt-BR', () => {
    const infratores = arquivosDeTela(SRC)
      .filter((f) => DECIMAL_COM_UNIDADE.test(readFileSync(f, 'utf8')))
      .map((f) => path.relative(RAIZ, f));

    expect(infratores).toEqual([]);
  });

  it('o padrão reprova as quatro formas de escrever o defeito', () => {
    // Guarda da guarda: sem isto, um padrão que nunca casa fica verde para
    // sempre e passa por proteção.
    const defeitos = [
      '`${(100 - pct).toFixed(1)}% da rede`',
      '<span>{(x).toFixed(1)}%</span>',
      '`${(m / 1000).toFixed(1)} km da fronteira`',
      '<span>{(v).toFixed(2)}m</span>',
    ];
    for (const d of defeitos) {
      expect(DECIMAL_COM_UNIDADE.test(d)).toBe(true);
    }
  });

  it('o padrão NÃO reprova coordenada nem contagem inteira', () => {
    // O falso positivo é o que faria alguém desligar a guarda: coordenada com
    // seis casas e percentual inteiro são os dois corretos neste projeto.
    const legitimos = [
      '{ficha.latitudeCapturada.toFixed(6)}',
      '`${e.lat.toFixed(4)}, ${e.lng.toFixed(4)}`',
      '`${((m.ativos / m.total) * 100).toFixed(0)}%`',
      '<span>{(distanciaM / 1000).toFixed(0)}km</span>',
    ];
    for (const l of legitimos) {
      expect(DECIMAL_COM_UNIDADE.test(l)).toBe(false);
    }
  });
});
