/**
 * Agrupamento PURO de saldos por material (quantificaveis). Os saldos vem por
 * (material, local, tamanho); a tela lista um material por linha com o total e
 * o detalhamento por local. Testavel isoladamente.
 */

import type { SaldoContextoDTO } from './dtos';

export interface MaterialAgrupado {
  materialId: string;
  descricao: string;
  /** Soma das quantidades de todos os locais/tamanhos. */
  total: number;
  /** Locais distintos com saldo. */
  totalLocais: number;
  /** Linhas de saldo (uma por local/tamanho), ordenadas por rotulo. */
  linhas: SaldoContextoDTO[];
}

/**
 * Agrupa saldos por material e ordena por descricao (pt-BR). Dentro de cada
 * material, ordena as linhas por rotulo do local e tamanho.
 */
export function agruparSaldos(saldos: readonly SaldoContextoDTO[]): MaterialAgrupado[] {
  const mapa = new Map<string, MaterialAgrupado>();
  for (const s of saldos) {
    const grupo = mapa.get(s.materialId);
    if (grupo) {
      grupo.total += s.quantidade;
      grupo.linhas.push(s);
    } else {
      mapa.set(s.materialId, {
        materialId: s.materialId,
        descricao: s.materialDescricao,
        total: s.quantidade,
        totalLocais: 0,
        linhas: [s],
      });
    }
  }

  const grupos = [...mapa.values()];
  for (const g of grupos) {
    g.linhas.sort(
      (a, b) =>
        a.localRotulo.localeCompare(b.localRotulo, 'pt-BR') ||
        (a.tamanho ?? '').localeCompare(b.tamanho ?? '', 'pt-BR'),
    );
    g.totalLocais = new Set(g.linhas.map((l) => l.localId)).size;
  }
  grupos.sort((a, b) => a.descricao.localeCompare(b.descricao, 'pt-BR'));
  return grupos;
}

/** Soma total de itens em estoque (todas as quantidades). */
export function somarQuantidades(saldos: readonly SaldoContextoDTO[]): number {
  return saldos.reduce((acc, s) => acc + s.quantidade, 0);
}
