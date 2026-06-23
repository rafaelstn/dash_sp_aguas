'use client';

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
 * Quadro "Lista de Status" no canto do canvas (padrão SIBH). Lista os 5 status
 * com a cor do domínio. O texto ao lado garante leitura sem depender de cor
 * (WCAG 1.4.1). É uma lista semântica para o leitor de tela.
 */
export function LegendaStatus() {
  return (
    <div className="pointer-events-none absolute bottom-4 left-4 rounded-md border border-app-border-subtle bg-white/95 p-3 shadow-gov-card">
      <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-app-fg-muted">
        Lista de status
      </p>
      <ul className="space-y-1.5">
        {ORDEM.map((status) => (
          <li key={status} className="flex items-center gap-2">
            <span
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: STATUS_COLORS[status] }}
              aria-hidden="true"
            />
            <span className="text-2xs text-app-fg">{STATUS_LABELS[status]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
