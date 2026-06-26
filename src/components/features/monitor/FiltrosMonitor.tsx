'use client';

import { useId } from 'react';
import type { TipoEstacao } from './tipos';

export interface ValorFiltros {
  bacia: string; // '' = todas
  tipo: '' | TipoEstacao; // '' = todos
}

interface FiltrosMonitorProps {
  valor: ValorFiltros;
  aoMudar: (v: ValorFiltros) => void;
  /** Bacias distintas presentes nos dados, já ordenadas. */
  bacias: readonly string[];
}

/**
 * Filtros do Monitor: bacia e tipo. Usa <select> nativo com <label htmlFor>
 * associado (controle de formulário acessível padrão e-MAG/WCAG 1.3.1, 4.1.2).
 * Não é dialog nativo do navegador, é controle de formulário, então segue a
 * regra do projeto (a proibição vale para alert/confirm/prompt).
 *
 * Estilo coerente com o Input do design system (mesma borda, foco e tokens).
 */
export function FiltrosMonitor({ valor, aoMudar, bacias }: FiltrosMonitorProps) {
  const idBase = useId();
  const idBacia = `${idBase}-bacia`;
  const idTipo = `${idBase}-tipo`;

  const classeSelect =
    'w-full appearance-none rounded border border-app-border-input bg-app-surface px-3 py-2 pr-8 text-sm text-app-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul focus-visible:ring-offset-1 focus-visible:ring-offset-app-surface';

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="flex flex-col gap-1">
        <label htmlFor={idBacia} className="text-sm font-medium text-app-fg">
          Bacia
        </label>
        <div className="relative">
          <select
            id={idBacia}
            value={valor.bacia}
            onChange={(e) => aoMudar({ ...valor, bacia: e.target.value })}
            className={classeSelect}
          >
            <option value="">Todas as bacias</option>
            {bacias.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <SetaSelect />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={idTipo} className="text-sm font-medium text-app-fg">
          Tipo
        </label>
        <div className="relative">
          <select
            id={idTipo}
            value={valor.tipo}
            onChange={(e) =>
              aoMudar({ ...valor, tipo: e.target.value as ValorFiltros['tipo'] })
            }
            className={classeSelect}
          >
            <option value="">Todos os tipos</option>
            <option value="automatico">Automática</option>
            <option value="manual">Manual</option>
          </select>
          <SetaSelect />
        </div>
      </div>
    </div>
  );
}

/** Chevron decorativo do select customizado (o nativo fica escondido). */
function SetaSelect() {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-app-fg-muted"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path
          d="M3 4.5L6 7.5L9 4.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
