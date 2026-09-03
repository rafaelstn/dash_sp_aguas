import { describe, it, expect } from 'vitest';
import { formatarMedida, formatarValor } from '@/lib/format';

/**
 * Medida em pt-BR, e a razão de NÃO ser o formatador genérico.
 *
 * A ficha exibia `2830.45` onde um documento de governo lê `2.830,45`. A
 * correção óbvia seria formatar todo número em `formatarValor`, e ela criaria
 * dois defeitos piores que o original:
 *
 *   - ANO: `operacaoInicioAno` 1941 viraria `1.941`.
 *   - COORDENADA: latitude e longitude são lidas com ponto decimal por
 *     convenção técnica, e separador de milhar nunca se aplica (não passam
 *     de 180).
 *
 * Por isso a escolha é do chamador. Estes casos protegem as duas metades: que
 * a medida É formatada, e que o formatador genérico continua NÃO formatando.
 */

describe('formatarMedida', () => {
  it('põe separador de milhar e vírgula decimal', () => {
    expect(formatarMedida(2830.45)).toBe('2.830,45');
  });

  it('formata inteiro grande sem inventar casas decimais', () => {
    expect(formatarMedida(1200)).toBe('1.200');
  });

  it('mantém número pequeno legível', () => {
    expect(formatarMedida(7.5)).toBe('7,5');
    expect(formatarMedida(0)).toBe('0');
  });

  it('preserva negativo', () => {
    expect(formatarMedida(-15.25)).toBe('-15,25');
  });

  it('cai no texto padrão quando não há valor', () => {
    expect(formatarMedida(null)).toBe('Não informado');
    expect(formatarMedida(undefined)).toBe('Não informado');
    expect(formatarMedida(Number.NaN)).toBe('Não informado');
  });

  it('não altera texto que já vem pronto', () => {
    expect(formatarMedida('PLUVIOMETRO')).toBe('PLUVIOMETRO');
  });
});

describe('o formatador genérico NÃO pode formatar número', () => {
  /**
   * O ponto do arquivo. Se alguém "melhorar" `formatarValor` para formatar
   * todo número, estes dois casos reprovam, e é isso que impede o ano de
   * virar 1.941 na ficha.
   */
  it('ano continua sem separador de milhar', () => {
    expect(formatarValor(1941)).toBe('1941');
    expect(formatarValor(2026)).toBe('2026');
  });

  it('coordenada continua com ponto decimal', () => {
    expect(formatarValor(-21.183333)).toBe('-21.183333');
    expect(formatarValor(-45.05)).toBe('-45.05');
  });
});
