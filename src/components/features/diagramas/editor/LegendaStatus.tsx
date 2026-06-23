'use client';

import { STATUS_LABELS, type StatusNivel } from '@/domain/diagramas/tipos';

/**
 * Cor do quadradinho de cada status na legenda, fiel ao SIBH: Normal é só
 * contorno (quadrado branco com borda), os demais são preenchidos em amarelo,
 * laranja e vermelho. Emergência segue a escala (vermelho mais forte) pra não
 * sumir do domínio de 5 níveis. Hex vindos da legenda real do site.
 */
const SWATCH: Record<StatusNivel, { fundo: string; borda: string }> = {
  normal: { fundo: 'transparent', borda: 'hsl(var(--border-strong))' },
  atencao: {
    fundo: 'hsl(var(--sibh-legenda-atencao))',
    borda: 'hsl(var(--sibh-legenda-atencao))',
  },
  alerta: {
    fundo: 'hsl(var(--sibh-legenda-alerta))',
    borda: 'hsl(var(--sibh-legenda-alerta))',
  },
  emergencia: {
    fundo: 'hsl(var(--sibh-legenda-extravasamento))',
    borda: 'hsl(var(--sibh-legenda-extravasamento))',
  },
  extravasamento: {
    fundo: 'hsl(var(--sibh-legenda-extravasamento))',
    borda: 'hsl(var(--sibh-legenda-extravasamento))',
  },
};

const ORDEM: StatusNivel[] = [
  'normal',
  'atencao',
  'alerta',
  'emergencia',
  'extravasamento',
];

/**
 * Quadro "Lista de Status" no canto do canvas, fiel ao SIBH/DAEE. Título e os
 * status com quadradinhos coloridos (Normal só contorno, Atenção amarelo,
 * Alerta laranja, Extravasamento vermelho). O texto ao lado garante leitura sem
 * depender de cor (WCAG 1.4.1) e o conjunto é uma lista semântica para o leitor
 * de tela.
 */
export function LegendaStatus() {
  return (
    <aside
      aria-label="Lista de status"
      className="pointer-events-none absolute bottom-4 left-4 rounded-md border border-app-border-subtle bg-white/95 px-3 py-2.5 shadow-gov-card backdrop-blur-sm"
    >
      <p className="mb-1.5 text-xs font-semibold text-app-fg">Lista de Status</p>
      <ul className="space-y-1">
        {ORDEM.map((status) => (
          <li key={status} className="flex items-center gap-2">
            <span
              className="h-3 w-3 shrink-0 rounded-[1px] border"
              style={{
                backgroundColor: SWATCH[status].fundo,
                borderColor: SWATCH[status].borda,
              }}
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
