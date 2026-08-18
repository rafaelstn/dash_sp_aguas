import { describe, expect, it } from 'vitest';
import {
  conciliarSaldos,
  type ChaveSaldo,
} from '@/application/use-cases/estoque/conciliar-saldos';

/**
 * Conciliação de integridade do almoxarifado: o saldo mantido em
 * `estoque_saldos` é projeção materializada, e o ledger
 * `estoque_movimentacoes` é a verdade de auditoria (ADR-0020). Divergência
 * entre os dois significa patrimônio público cujo número não se sustenta na
 * trilha, que é exatamente o que auditoria cobra.
 *
 * A função sob teste é pura sobre dois retratos já carregados, então prova
 * sem banco. O que o banco tem a dizer (a soma do ledger em si) é
 * responsabilidade de quem monta o retrato.
 */

const M1 = '11111111-1111-4111-8111-111111111111';
const M2 = '22222222-2222-4222-8222-222222222222';
const L1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const L2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function saldo(
  materialId: string,
  localId: string,
  quantidade: number,
  tamanho: string | null = null,
): ChaveSaldo & { quantidade: number } {
  return { materialId, localId, tamanho, quantidade };
}

function ledger(
  materialId: string,
  localId: string,
  soma: number,
  tamanho: string | null = null,
): ChaveSaldo & { soma: number } {
  return { materialId, localId, tamanho, soma };
}

describe('conciliarSaldos', () => {
  it('não acusa divergência quando todo saldo bate com o ledger', () => {
    const divergencias = conciliarSaldos(
      [saldo(M1, L1, 10), saldo(M2, L2, 3)],
      [ledger(M1, L1, 10), ledger(M2, L2, 3)],
    );

    expect(divergencias).toEqual([]);
  });

  it('acusa o saldo que não bate, com a diferença assinada', () => {
    const divergencias = conciliarSaldos([saldo(M1, L1, 12)], [ledger(M1, L1, 10)]);

    expect(divergencias).toHaveLength(1);
    expect(divergencias[0]).toMatchObject({
      materialId: M1,
      localId: L1,
      saldoAtual: 12,
      somaLedger: 10,
      diferenca: 2,
    });
  });

  it('assina a diferença como negativa quando o saldo está abaixo do ledger', () => {
    const divergencias = conciliarSaldos([saldo(M1, L1, 7)], [ledger(M1, L1, 10)]);

    expect(divergencias[0]?.diferenca).toBe(-3);
  });

  it('acusa saldo mantido sem nenhuma movimentação no ledger', () => {
    // Quantidade que apareceu no saldo sem trilha que a explique: o caso mais
    // grave, porque o número existe e nada o justifica.
    const divergencias = conciliarSaldos([saldo(M1, L1, 5)], []);

    expect(divergencias).toHaveLength(1);
    expect(divergencias[0]).toMatchObject({ saldoAtual: 5, somaLedger: 0, diferenca: 5 });
  });

  it('acusa movimentação no ledger sem linha de saldo (saldo implícito zero)', () => {
    // Ramo que só existe porque a ausência de linha de saldo não é o mesmo que
    // saldo zero: sem este caso, material movimentado e nunca projetado passaria
    // batido.
    const divergencias = conciliarSaldos([], [ledger(M1, L1, 4)]);

    expect(divergencias).toHaveLength(1);
    expect(divergencias[0]).toMatchObject({ saldoAtual: 0, somaLedger: 4, diferenca: -4 });
  });

  it('não acusa chave do ledger que soma zero e não tem linha de saldo', () => {
    // Entrada e saída que se anulam não deixam saldo, e isso está correto.
    const divergencias = conciliarSaldos([], [ledger(M1, L1, 0)]);

    expect(divergencias).toEqual([]);
  });

  it('trata tamanho como parte da chave, não como detalhe', () => {
    // Mesmo material e mesmo local em dois tamanhos: são duas chaves. Se o
    // tamanho fosse ignorado, as somas se misturariam e a conciliação daria
    // falso verde.
    const divergencias = conciliarSaldos(
      [saldo(M1, L1, 5, 'P'), saldo(M1, L1, 2, 'G')],
      [ledger(M1, L1, 5, 'P'), ledger(M1, L1, 9, 'G')],
    );

    expect(divergencias).toHaveLength(1);
    expect(divergencias[0]).toMatchObject({ tamanho: 'G', saldoAtual: 2, somaLedger: 9 });
  });

  it('distingue tamanho nulo de tamanho preenchido', () => {
    // `null` e 'P' são chaves diferentes. Confundir as duas é o erro clássico
    // de montar chave por concatenação sem separador estável.
    const divergencias = conciliarSaldos(
      [saldo(M1, L1, 1, null)],
      [ledger(M1, L1, 1, 'P')],
    );

    // O saldo de tamanho nulo não tem ledger (diferenca 1) e o ledger de
    // tamanho P não tem saldo (diferenca -1). Duas divergências, não zero.
    expect(divergencias).toHaveLength(2);
    expect(divergencias.map((d) => d.diferenca).sort()).toEqual([-1, 1]);
  });

  it('não confunde o mesmo material em locais diferentes', () => {
    const divergencias = conciliarSaldos(
      [saldo(M1, L1, 5), saldo(M1, L2, 5)],
      [ledger(M1, L1, 5), ledger(M1, L2, 5)],
    );

    expect(divergencias).toEqual([]);
  });

  it('reporta todas as divergências, não só a primeira', () => {
    const divergencias = conciliarSaldos(
      [saldo(M1, L1, 1), saldo(M2, L2, 2)],
      [ledger(M1, L1, 9), ledger(M2, L2, 8)],
    );

    expect(divergencias).toHaveLength(2);
  });
});
