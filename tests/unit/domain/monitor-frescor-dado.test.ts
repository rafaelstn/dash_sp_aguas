import { describe, expect, it } from 'vitest';
import {
  calcularFrescor,
  descreverIdade,
  HORAS_ATE_DEFASAR,
} from '@/domain/monitor/frescor-dado';

/**
 * O caso que originou esta função: em 18/08/2026 o banco tinha a última
 * transmissão de 15/07/2026 e o Monitor exibia o número de estações "online"
 * daquela foto como se fosse o momento. A tela não tinha como saber a idade do
 * que mostrava.
 */

const AGORA = new Date('2026-08-18T18:00:00.000Z');
const h = (n: number) => new Date(AGORA.getTime() - n * 3_600_000).toISOString();

describe('calcularFrescor', () => {
  it('pega a transmissão mais recente, não a primeira nem a última da lista', () => {
    const r = calcularFrescor([h(50), h(2), h(30)], AGORA);
    expect(r.idadeHoras).toBeCloseTo(2, 5);
  });

  it('considera fresco o dado dentro da janela', () => {
    const r = calcularFrescor([h(3)], AGORA);
    expect(r.defasado).toBe(false);
  });

  it('considera defasado o dado além da janela', () => {
    const r = calcularFrescor([h(HORAS_ATE_DEFASAR + 1)], AGORA);
    expect(r.defasado).toBe(true);
  });

  it('não acusa uma carga diária normal, que é o uso esperado', () => {
    // A sincronização roda 1x por dia, então 24h de idade é o normal e não pode
    // acender aviso. Guarda contra alguém baixar o limiar para 24h ou menos e
    // transformar a tela num alarme permanente, que ninguém lê na segunda vez.
    expect(HORAS_ATE_DEFASAR).toBeGreaterThan(24);
    const r = calcularFrescor([h(24)], AGORA);
    expect(r.defasado).toBe(false);
  });

  it('acusa quando uma execução diária foi perdida', () => {
    // Dois dias sem carga: aí sim é notícia.
    const r = calcularFrescor([h(48)], AGORA);
    expect(r.defasado).toBe(true);
  });

  it('reproduz o caso real de 34 dias', () => {
    const r = calcularFrescor(['2026-07-15T15:20:00.000Z'], AGORA);
    expect(r.defasado).toBe(true);
    expect(Math.floor((r.idadeHoras ?? 0) / 24)).toBe(34);
    expect(descreverIdade(r.idadeHoras)).toBe('há 34 dias');
  });

  it('trata lista vazia como defasado, nunca como fresco', () => {
    // O contrário faria a tela ficar calada justamente no caso mais grave:
    // nenhuma transmissão conhecida.
    const r = calcularFrescor([], AGORA);
    expect(r.defasado).toBe(true);
    expect(r.maisRecente).toBeNull();
    expect(r.idadeHoras).toBeNull();
  });

  it('ignora nulo, vazio e data inválida em vez de virar "agora"', () => {
    // Uma data quebrada não pode contaminar o máximo: se `new Date('abacaxi')`
    // escapasse, o resultado seria NaN e o veredito viraria imprevisível.
    const r = calcularFrescor([null, undefined, '', '   ', 'abacaxi', h(48)], AGORA);
    expect(r.defasado).toBe(true);
    expect(r.idadeHoras).toBeCloseTo(48, 5);
  });

  it('quando só há entrada inválida, responde como se não houvesse dado', () => {
    const r = calcularFrescor(['abacaxi', null], AGORA);
    expect(r.maisRecente).toBeNull();
    expect(r.defasado).toBe(true);
  });

  it('aceita Date além de string', () => {
    const r = calcularFrescor([new Date(AGORA.getTime() - 3_600_000)], AGORA);
    expect(r.idadeHoras).toBeCloseTo(1, 5);
  });

  it('descarta Date inválido', () => {
    const r = calcularFrescor([new Date('nada')], AGORA);
    expect(r.maisRecente).toBeNull();
  });

  it('data no futuro vira idade zero, nunca negativa', () => {
    // O SIBH devolve horário aparentemente de Brasília rotulado como GMT+0000,
    // o que produz timestamp adiantado. "Daqui a uma hora" não é idade.
    const futuro = new Date(AGORA.getTime() + 2 * 3_600_000);
    const r = calcularFrescor([futuro], AGORA);
    expect(r.idadeHoras).toBe(0);
    expect(r.defasado).toBe(false);
  });
});

describe('descreverIdade', () => {
  it('usa singular e plural corretamente', () => {
    expect(descreverIdade(null)).toBe('sem registro de transmissão');
    expect(descreverIdade(0.5)).toBe('há menos de 1 hora');
    expect(descreverIdade(1.5)).toBe('há 1 hora');
    expect(descreverIdade(5)).toBe('há 5 horas');
    expect(descreverIdade(25)).toBe('há 1 dia');
    expect(descreverIdade(72)).toBe('há 3 dias');
  });

  it('não usa travessão nem abreviação obscura', () => {
    for (const n of [null, 0.2, 1.2, 8, 30, 200]) {
      const texto = descreverIdade(n);
      expect(texto).not.toMatch(/[–—]/);
      expect(texto).not.toMatch(/\bhrs?\b|\bd\b/);
    }
  });
});
