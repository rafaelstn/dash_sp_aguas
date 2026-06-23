'use client';

import { ListChecks } from 'lucide-react';
import {
  STATUS_COLORS,
  STATUS_LABELS,
  type StatusNivel,
} from '@/domain/diagramas/tipos';

const ORDEM: StatusNivel[] = [
  'normal',
  'atencao',
  'alerta',
  'emergencia',
  'extravasamento',
];

/**
 * Quadro "Lista de Status" no canto do canvas (padrão SIBH). Cabeçalho com
 * ícone e os 5 status com a cor do domínio. O texto ao lado garante leitura
 * sem depender de cor (WCAG 1.4.1). É uma lista semântica para o leitor de
 * tela. O painel é translúcido com leve desfoque para assentar sobre a grade
 * blueprint sem competir com os elementos do diagrama.
 */
export function LegendaStatus() {
  return (
    <aside
      aria-label="Lista de status"
      className="pointer-events-none absolute bottom-4 left-4 w-44 overflow-hidden rounded-lg border border-app-border-subtle bg-white/90 shadow-gov-card backdrop-blur-sm"
    >
      <div className="flex items-center gap-1.5 border-b border-app-border-subtle bg-app-surface-2/80 px-3 py-1.5">
        <ListChecks className="h-3.5 w-3.5 text-gov-azul" aria-hidden="true" />
        <p className="text-2xs font-semibold uppercase tracking-wide text-app-fg-muted">
          Lista de status
        </p>
      </div>
      <ul className="space-y-1 px-3 py-2.5">
        {ORDEM.map((status) => (
          <li key={status} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/5"
              style={{ backgroundColor: STATUS_COLORS[status] }}
              aria-hidden="true"
            />
            <span className="text-2xs text-app-fg">
              {STATUS_LABELS[status]}
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
