/**
 * Agrupamento PURO de saldos por material (quantificaveis). Os saldos vem por
 * (material, local, tamanho); a tela lista um material por linha com o total e
 * o detalhamento por local. Testavel isoladamente.
 */

import { abaixoDoMinimo } from '@/domain/estoque/reposicao';
import type { SaldoContextoDTO } from './dtos';

export interface MaterialAgrupado {
  materialId: string;
  descricao: string;
  /** Marca do material (do catalogo), quando conhecida. Diferencia homonimos. */
  marca: string | null;
  /** Modelo do material (do catalogo), quando conhecido. Diferencia homonimos. */
  modelo: string | null;
  /** Soma das quantidades de todos os locais/tamanhos. */
  total: number;
  /** Locais distintos com saldo. */
  totalLocais: number;
  /**
   * Nivel de reposicao (estoque minimo) do catalogo. null = sem minimo (nao
   * alerta). Resolvido pelo `resolver`; sem ele fica null.
   */
  quantidadeMinima: number | null;
  /**
   * True quando `total < quantidadeMinima` (precisa reposicao). Calculado com o
   * total ja somado, reaproveitando `abaixoDoMinimo` (domain/reposicao).
   */
  abaixoDoMinimo: boolean;
  /** Linhas de saldo (uma por local/tamanho), ordenadas por rotulo. */
  linhas: SaldoContextoDTO[];
}

/**
 * Resolve dados do catalogo de um material ja carregado na tela. Os saldos
 * (`SaldoContextoDTO`) trazem so a descricao; marca, modelo e o nivel de
 * reposicao vivem no `MaterialDTO`. Passar este resolver evita depender de campo
 * novo no payload de saldos. Sem resolver, os campos ficam nulos (comportamento
 * antigo). `quantidadeMinima` e opcional para compatibilidade.
 */
export type ResolverMaterial = (
  materialId: string,
) =>
  | { marca: string | null; modelo: string | null; quantidadeMinima?: number | null }
  | undefined;

/**
 * Agrupa saldos por material e ordena por descricao (pt-BR). Dentro de cada
 * material, ordena as linhas por rotulo do local e tamanho. Quando `resolver` e
 * informado, anexa marca, modelo e a quantidade minima do catalogo; o campo
 * `abaixoDoMinimo` e calculado a partir do total somado.
 */
export function agruparSaldos(
  saldos: readonly SaldoContextoDTO[],
  resolver?: ResolverMaterial,
): MaterialAgrupado[] {
  const mapa = new Map<string, MaterialAgrupado>();
  for (const s of saldos) {
    const grupo = mapa.get(s.materialId);
    if (grupo) {
      grupo.total += s.quantidade;
      grupo.linhas.push(s);
    } else {
      const material = resolver?.(s.materialId);
      mapa.set(s.materialId, {
        materialId: s.materialId,
        descricao: s.materialDescricao,
        marca: material?.marca ?? null,
        modelo: material?.modelo ?? null,
        total: s.quantidade,
        totalLocais: 0,
        quantidadeMinima: material?.quantidadeMinima ?? null,
        abaixoDoMinimo: false,
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
    // Total ja somado: agora a regra de reposicao pode ser avaliada uma vez.
    g.abaixoDoMinimo = abaixoDoMinimo(g.total, g.quantidadeMinima);
  }
  grupos.sort((a, b) => a.descricao.localeCompare(b.descricao, 'pt-BR'));
  return grupos;
}

/** Soma total de itens em estoque (todas as quantidades). */
export function somarQuantidades(saldos: readonly SaldoContextoDTO[]): number {
  return saldos.reduce((acc, s) => acc + s.quantidade, 0);
}

/** Quantos materiais estao abaixo do minimo (precisam reposicao). */
export function contarAbaixoDoMinimo(grupos: readonly MaterialAgrupado[]): number {
  return grupos.reduce((n, g) => (g.abaixoDoMinimo ? n + 1 : n), 0);
}

/** Mantem apenas os materiais abaixo do minimo (para o filtro de reposicao). */
export function filtrarAbaixoDoMinimo(
  grupos: readonly MaterialAgrupado[],
): MaterialAgrupado[] {
  return grupos.filter((g) => g.abaixoDoMinimo);
}
