import { describe, expect, it } from 'vitest';
import { agregarDiario } from '@/domain/monitor/agregacao-hidrologica';
import type { MedicaoSibh } from '@/application/ports/sibh-gateway';

/**
 * Testes do domínio de agregação por dia hidrológico.
 *
 * Regra sob teste (convenção DAEE/ANA): a chuva acumula de 07:00 do dia D
 * até 06:59 do dia D+1, e o total é atribuído ao dia D.
 *   - medição às 06:59 cai no dia hidrológico ANTERIOR;
 *   - medição às 07:00 inicia um NOVO dia hidrológico.
 */

function medicao(momento: string, valorMm: number): MedicaoSibh {
  return {
    prefixo: 'F12-345',
    nome: 'Estação Teste',
    valorMm,
    momento,
    gapMinutos: 60,
  };
}

describe('domínio/monitor — agregarDiario (dia hidrológico 07:00 -> 06:59)', () => {
  it('retorna vazio para lista vazia', () => {
    expect(agregarDiario([])).toEqual([]);
  });

  it('soma as medições de mm dentro do mesmo dia hidrológico', () => {
    const medicoes = [
      medicao('2026/06/20 07:00', 1.5),
      medicao('2026/06/20 12:00', 2.5),
      medicao('2026/06/20 23:00', 1.0),
      medicao('2026/06/21 06:59', 0.5),
    ];

    const resultado = agregarDiario(medicoes);

    expect(resultado).toEqual([
      {
        data: '2026-06-20',
        totalMm: 5.5,
        medicoesCount: 4,
        dataInicio: '2026-06-20 07:00',
        dataFim: '2026-06-21 06:59',
      },
    ]);
  });

  it('coloca a medição de 06:59 no dia anterior e a de 07:00 no novo dia (corte da janela)', () => {
    const medicoes = [
      medicao('2026/06/21 06:59', 10), // pertence a 2026-06-20
      medicao('2026/06/21 07:00', 4), // inicia 2026-06-21
    ];

    const resultado = agregarDiario(medicoes);

    // Ordenado da data mais recente para a mais antiga.
    expect(resultado.map((d) => d.data)).toEqual(['2026-06-21', '2026-06-20']);
    expect(resultado.map((d) => [d.data, d.totalMm, d.medicoesCount])).toEqual([
      ['2026-06-21', 4, 1],
      ['2026-06-20', 10, 1],
    ]);
  });

  it('vira o mês corretamente: 06:59 do dia 01 cai no último dia do mês anterior', () => {
    const medicoes = [medicao('2026/07/01 06:59', 3)];

    const resultado = agregarDiario(medicoes);

    expect(resultado).toEqual([
      {
        data: '2026-06-30',
        totalMm: 3,
        medicoesCount: 1,
        dataInicio: '2026-06-30 07:00',
        dataFim: '2026-07-01 06:59',
      },
    ]);
  });

  it('arredonda o total a 2 casas decimais (sem erro de float acumulado)', () => {
    const medicoes = [
      medicao('2026/06/20 08:00', 0.1),
      medicao('2026/06/20 09:00', 0.2),
    ];

    const resultado = agregarDiario(medicoes);

    expect(resultado.map((d) => d.totalMm)).toEqual([0.3]);
  });

  it('ignora medições com timestamp em formato inesperado', () => {
    const medicoes = [
      medicao('2026/06/20 08:00', 5),
      medicao('20-06-2026 08:00', 99), // formato inválido, descartado
    ];

    const resultado = agregarDiario(medicoes);

    expect(resultado.map((d) => [d.totalMm, d.medicoesCount])).toEqual([[5, 1]]);
  });
});
