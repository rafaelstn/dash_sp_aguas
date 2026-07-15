'use client';

import { useId } from 'react';
import { Search, X } from 'lucide-react';
import type { TipoEstacao, TipoHidrologico } from './tipos';

export interface ValorFiltros {
  /** UGRHI (antigo "bacia" = ugrhi_name). '' = todas. */
  bacia: string;
  tipo: '' | TipoEstacao; // '' = todos
  /**
   * Tipo hidrológico (o que a estação mede). Nunca vazio: o Monitor mostra um
   * tipo por vez. Controlado pelo SeletorTipoHidrologico, fora deste grid.
   */
  tipoEstacao: TipoHidrologico;
  /** Entidades selecionadas (owner). Vazio = todas as entidades. */
  entidades: string[];
  /** Busca livre por nome OU prefixo (ID), case-insensitive. '' = sem busca. */
  busca: string;
}

/**
 * Valor inicial dos filtros.
 *
 * Padrão de abertura pedido pelo cliente: tipo hidrológico "pluviométrico" e
 * apenas a entidade "SP ÁGUAS" marcada (a chave exata do owner na paleta). A
 * seleção de entidade é feita pela legenda do mapa; o dropdown foi removido.
 */
export const FILTROS_INICIAIS: ValorFiltros = {
  bacia: '',
  tipo: '',
  tipoEstacao: 'pluviometrico',
  entidades: ['SP ÁGUAS'],
  busca: '',
};

interface FiltrosMonitorProps {
  valor: ValorFiltros;
  aoMudar: (v: ValorFiltros) => void;
  /** UGRHIs distintas presentes nos dados, já ordenadas. */
  bacias: readonly string[];
}

/**
 * Filtros do Monitor: busca, UGRHI e tipo (manual/automática).
 *
 * A seleção de entidade responsável NÃO fica aqui: é feita pela legenda do mapa
 * (fonte única), evitando dois controles para a mesma dimensão. O tipo
 * hidrológico é controlado pelo SeletorTipoHidrologico, abaixo do mapa.
 *
 * Acessibilidade (e-MAG / WCAG 1.3.1, 2.1.1, 4.1.2): <label htmlFor> em todo
 * controle, busca com botão de limpar, foco visível em gov-azul. Estilo coerente
 * com o Input do design system (mesma borda, foco e tokens).
 */
export function FiltrosMonitor({ valor, aoMudar, bacias }: FiltrosMonitorProps) {
  const idBase = useId();
  const idBusca = `${idBase}-busca`;
  const idBacia = `${idBase}-bacia`;
  const idTipo = `${idBase}-tipo`;

  const classeSelect =
    'w-full appearance-none rounded border border-app-border-input bg-app-surface px-3 py-2 pr-8 text-sm text-app-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul focus-visible:ring-offset-1 focus-visible:ring-offset-app-surface';

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {/* Busca por nome ou ID (prefixo) */}
      <div className="flex flex-col gap-1">
        <label htmlFor={idBusca} className="text-sm font-medium text-app-fg">
          Buscar por nome ou ID
        </label>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-app-fg-muted"
          />
          <input
            id={idBusca}
            type="text"
            inputMode="search"
            value={valor.busca}
            onChange={(e) => aoMudar({ ...valor, busca: e.target.value })}
            placeholder="Nome ou prefixo da estação"
            className="w-full rounded border border-app-border-input bg-app-surface py-2 pl-8 pr-8 text-sm text-app-fg placeholder:text-app-fg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul focus-visible:ring-offset-1 focus-visible:ring-offset-app-surface"
          />
          {valor.busca ? (
            <button
              type="button"
              onClick={() => aoMudar({ ...valor, busca: '' })}
              aria-label="Limpar busca"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-app-fg-muted hover:bg-app-surface-2 hover:text-app-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      {/* UGRHI (era "Bacia"; o dado é ugrhi_name) */}
      <div className="flex flex-col gap-1">
        <label htmlFor={idBacia} className="text-sm font-medium text-app-fg">
          UGRHI
        </label>
        <div className="relative">
          <select
            id={idBacia}
            value={valor.bacia}
            onChange={(e) => aoMudar({ ...valor, bacia: e.target.value })}
            className={classeSelect}
          >
            <option value="">Todas as UGRHIs</option>
            {bacias.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          <SetaSelect />
        </div>
      </div>

      {/* Tipo (manual / automática) */}
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
