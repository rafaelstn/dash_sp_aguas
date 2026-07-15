'use client';

import type { PontoNivel } from './tipos-nivel';
import { fmtDataLonga } from './estatisticas-leituras';
import { fmtMetros } from './estatisticas-nivel';

/**
 * Tabela de nível: alternativa textual acessível ao GraficoNivel (e-MAG / WCAG
 * 1.1.1). Colunas Data, Nível médio, Mínimo e Máximo (m). A série chega
 * crescente no tempo; invertemos para mostrar as leituras mais recentes no topo
 * (o operador quer ver o dia de hoje primeiro).
 */
export function TabelaNivel({ itens }: { itens: readonly PontoNivel[] }) {
  const linhas = [...itens].reverse();
  return (
    <div className="overflow-x-auto rounded-gov-card border border-app-border-subtle bg-app-surface">
      <table className="w-full border-collapse text-sm tabular">
        <caption className="sr-only">
          Série diária de nível da estação: data, nível médio, mínimo e máximo,
          em metros. Equivalente textual do gráfico de linha.
        </caption>
        <thead>
          <tr className="bg-app-surface-2">
            <th
              scope="col"
              className="border-b border-app-border-subtle px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-app-fg-muted"
            >
              Data
            </th>
            <th
              scope="col"
              className="border-b border-app-border-subtle px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-app-fg-muted"
            >
              Nível médio
            </th>
            <th
              scope="col"
              className="border-b border-app-border-subtle px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-app-fg-muted"
            >
              Mínimo
            </th>
            <th
              scope="col"
              className="border-b border-app-border-subtle px-3 py-1.5 text-right text-xs font-semibold uppercase tracking-wide text-app-fg-muted"
            >
              Máximo
            </th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((item) => (
            <tr
              key={item.momento}
              className="border-b border-app-border-subtle last:border-0 even:bg-app-surface-2/40"
            >
              <th
                scope="row"
                className="px-3 py-1.5 text-left font-normal text-app-fg"
              >
                {fmtDataLonga(item.momento)}
              </th>
              <td className="px-3 py-1.5 text-right font-medium text-app-fg">
                {fmtMetros(item.nivelMedioM)}
              </td>
              <td className="px-3 py-1.5 text-right text-app-fg-subtle">
                {fmtMetros(item.nivelMinM)}
              </td>
              <td className="px-3 py-1.5 text-right text-app-fg-subtle">
                {fmtMetros(item.nivelMaxM)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
