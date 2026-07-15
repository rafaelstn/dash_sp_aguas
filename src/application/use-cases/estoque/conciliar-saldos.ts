import type { EstoqueSaldosRepository } from '@/application/ports/estoque-saldos-repository';

/**
 * Conciliacao de integridade: o saldo MANTIDO (`estoque_saldos`) deve bater com
 * a soma do ledger (`estoque_movimentacoes`) para cada (material, local, tamanho).
 * O saldo e projecao materializada; o ledger e a verdade de auditoria (ADR 0020).
 *
 * Esta funcao e PURA sobre dois retratos ja carregados (saldo atual x soma do
 * ledger), para ser testavel sem banco. O calculo da soma do ledger e a
 * comparacao real com o banco ficam no script/endpoint que chama isto.
 *
 * Convencao de sinal do ledger por (material, local, tamanho):
 *   entrada      -> +q no local (destino)
 *   saida        -> -q no local (origem)
 *   baixa        -> -q no local (origem)
 *   transferencia-> -q na origem e +q no destino
 *   ajuste       -> serializado apenas (nao afeta saldo de quantificavel)
 */

export interface ChaveSaldo {
  materialId: string;
  localId: string;
  tamanho: string | null;
}

export interface DivergenciaSaldo extends ChaveSaldo {
  saldoAtual: number;
  somaLedger: number;
  diferenca: number;
}

function chaveTexto(c: ChaveSaldo): string {
  return `${c.materialId}|${c.localId}|${c.tamanho ?? ''}`;
}

/**
 * Compara o saldo mantido com a soma do ledger e devolve as divergencias
 * (diferenca != 0). Funcao pura.
 */
export function conciliarSaldos(
  saldos: ReadonlyArray<ChaveSaldo & { quantidade: number }>,
  somasLedger: ReadonlyArray<ChaveSaldo & { soma: number }>,
): DivergenciaSaldo[] {
  const mapaLedger = new Map<string, number>();
  for (const s of somasLedger) mapaLedger.set(chaveTexto(s), s.soma);

  const vistos = new Set<string>();
  const divergencias: DivergenciaSaldo[] = [];

  for (const saldo of saldos) {
    const chave = chaveTexto(saldo);
    vistos.add(chave);
    const somaLedger = mapaLedger.get(chave) ?? 0;
    if (saldo.quantidade !== somaLedger) {
      divergencias.push({
        materialId: saldo.materialId,
        localId: saldo.localId,
        tamanho: saldo.tamanho,
        saldoAtual: saldo.quantidade,
        somaLedger,
        diferenca: saldo.quantidade - somaLedger,
      });
    }
  }

  // Chaves que existem no ledger mas nao tem linha de saldo (saldo implicito 0).
  for (const l of somasLedger) {
    const chave = chaveTexto(l);
    if (vistos.has(chave)) continue;
    if (l.soma !== 0) {
      divergencias.push({
        materialId: l.materialId,
        localId: l.localId,
        tamanho: l.tamanho,
        saldoAtual: 0,
        somaLedger: l.soma,
        diferenca: -l.soma,
      });
    }
  }

  return divergencias;
}

/**
 * Placeholder de leitura para o endpoint/script de conciliacao consumir o
 * repositorio de saldos. Mantido para o wiring do use-case; a soma do ledger e
 * calculada por query dedicada no script.
 */
export async function listarSaldosParaConciliacao(
  saldos: EstoqueSaldosRepository,
): Promise<ReadonlyArray<ChaveSaldo & { quantidade: number }>> {
  const linhas = await saldos.listar({});
  return linhas.map((s) => ({
    materialId: s.materialId,
    localId: s.localId,
    tamanho: s.tamanho,
    quantidade: s.quantidade,
  }));
}
