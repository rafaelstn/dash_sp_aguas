'use client';

import type { Estacao } from './tipos';
import type { DiaComparacao } from './useLeiturasMultiplas';
import { corComparacao } from './cores-comparacao';
import { fmtDataLonga, fmtMm } from './estatisticas-leituras';

interface TabelaComparacaoProps {
  /** Série diária unificada (ordem cronológica crescente). */
  dias: readonly DiaComparacao[];
  /** Estações exibidas, na ordem da cesta (define a cor da coluna). */
  estacoes: readonly Estacao[];
}

/** Rótulo curto de uma estação para o cabeçalho da coluna. */
function rotuloEstacao(e: Estacao): string {
  return e.prefixo || e.nome || 'Estação';
}

/**
 * Tabela equivalente ao gráfico de comparação (alternativa textual acessível,
 * e-MAG / WCAG 1.1.1). Uma coluna por estação, uma linha por dia, com o total
 * automático em mm. Mais recentes primeiro (o operador quer o dia de hoje no
 * topo). A cor é apoio visual (bolinha aria-hidden); o nome da estação está
 * sempre em texto no cabeçalho.
 */
export function TabelaComparacao({ dias, estacoes }: TabelaComparacaoProps) {
  // Cópia invertida: a série chega crescente; mostramos do mais recente.
  const linhas = [...dias].reverse();

  return (
    <div className="overflow-x-auto rounded-gov-card border border-app-border-subtle bg-app-surface">
      <table className="w-full border-collapse text-sm tabular">
        <caption className="sr-only">
          Comparação de chuva diária por estação: cada coluna é uma estação, cada
          linha é um dia, com o total automático em milímetros. Equivalente
          textual do gráfico de barras.
        </caption>
        <thead>
          <tr className="bg-app-surface-2">
            <th
              scope="col"
              className="sticky left-0 z-10 border-b border-app-border-subtle bg-app-surface-2 px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-app-fg-muted"
            >
              Data
            </th>
            {estacoes.map((e, indice) => (
              <th
                key={e.id}
                scope="col"
                className="border-b border-app-border-subtle px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-app-fg-muted"
              >
                <span className="inline-flex items-center justify-end gap-1.5">
                  <span
                    aria-hidden="true"
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-app-border-subtle"
                    style={{ backgroundColor: corComparacao(indice) }}
                  />
                  <span title={e.nome || undefined}>{rotuloEstacao(e)}</span>
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {linhas.map((dia) => (
            <tr
              key={dia.data}
              className="border-b border-app-border-subtle last:border-0 even:bg-app-surface-2/40"
            >
              <th
                scope="row"
                className="sticky left-0 z-10 bg-inherit px-3 py-1.5 text-left font-normal text-app-fg"
              >
                {fmtDataLonga(`${dia.data}T12:00:00`)}
              </th>
              {estacoes.map((e) => {
                const mm = dia.porEstacao[e.id];
                return (
                  <td
                    key={e.id}
                    className="px-3 py-1.5 text-right text-app-fg"
                  >
                    {mm === undefined ? (
                      <span className="text-app-fg-subtle">—</span>
                    ) : (
                      fmtMm(mm)
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
