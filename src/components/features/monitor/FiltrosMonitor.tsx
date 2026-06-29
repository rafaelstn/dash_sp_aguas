'use client';

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search, X } from 'lucide-react';
import type { TipoEstacao } from './tipos';
import { LEGENDA_ENTIDADES } from './paleta-monitor';

export interface ValorFiltros {
  /** UGRHI (antigo "bacia" = ugrhi_name). '' = todas. */
  bacia: string;
  tipo: '' | TipoEstacao; // '' = todos
  /** Entidades selecionadas (owner). Vazio = todas as entidades. */
  entidades: string[];
  /** Busca livre por nome OU prefixo (ID), case-insensitive. '' = sem busca. */
  busca: string;
}

/** Valor inicial dos filtros (nenhum filtro ativo = mostra tudo). */
export const FILTROS_INICIAIS: ValorFiltros = {
  bacia: '',
  tipo: '',
  entidades: [],
  busca: '',
};

interface FiltrosMonitorProps {
  valor: ValorFiltros;
  aoMudar: (v: ValorFiltros) => void;
  /** UGRHIs distintas presentes nos dados, já ordenadas. */
  bacias: readonly string[];
  /** Entidades distintas presentes nos dados (chaves de owner, com "Outros"). */
  entidadesDisponiveis: readonly string[];
}

/**
 * Filtros do Monitor: busca, entidade (multisseleção), UGRHI e tipo.
 *
 * Acessibilidade (e-MAG / WCAG 1.3.1, 2.1.1, 4.1.2): <label htmlFor> em todo
 * controle, busca com botão de limpar, multiselect navegável por teclado com
 * role=listbox/option e aria-selected. Bolinha colorida da entidade é só apoio
 * visual (aria-hidden); o nome em texto é a pista real (1.4.1).
 *
 * Estilo coerente com o Input do design system (mesma borda, foco e tokens).
 */
export function FiltrosMonitor({
  valor,
  aoMudar,
  bacias,
  entidadesDisponiveis,
}: FiltrosMonitorProps) {
  const idBase = useId();
  const idBusca = `${idBase}-busca`;
  const idBacia = `${idBase}-bacia`;
  const idTipo = `${idBase}-tipo`;

  const classeSelect =
    'w-full appearance-none rounded border border-app-border-input bg-app-surface px-3 py-2 pr-8 text-sm text-app-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul focus-visible:ring-offset-1 focus-visible:ring-offset-app-surface';

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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

      {/* Entidade responsável (multisseleção) */}
      <SelecaoEntidades
        idBase={idBase}
        selecionadas={valor.entidades}
        disponiveis={entidadesDisponiveis}
        aoMudar={(entidades) => aoMudar({ ...valor, entidades })}
      />

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

      {/* Tipo */}
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

// Cor de cada entidade pra bolinha do multiselect (apoio visual, aria-hidden).
const COR_ENTIDADE = new Map(
  LEGENDA_ENTIDADES.map((e) => [e.nome, e.cor]),
);

/**
 * Multisseleção de entidades: botão que abre um painel com "Todas" + uma opção
 * por entidade (checkbox + bolinha colorida + nome). Lista vazia = todas.
 *
 * Teclado: o trigger é um button (Enter/Espaço); o painel é um listbox com
 * options focáveis. Escape e clique-fora fecham. Foco visível em tudo.
 */
function SelecaoEntidades({
  idBase,
  selecionadas,
  disponiveis,
  aoMudar,
}: {
  idBase: string;
  selecionadas: string[];
  disponiveis: readonly string[];
  aoMudar: (entidades: string[]) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const refTrigger = useRef<HTMLButtonElement>(null);
  const refPainel = useRef<HTMLDivElement>(null);
  const idLabel = `${idBase}-entidade-label`;
  const idListbox = `${idBase}-entidade-listbox`;

  // O painel é renderizado via portal no <body> (não dentro do fluxo do mapa),
  // então posicionamos manualmente sobre o trigger. Assim o z-index alto vale
  // de verdade e nenhum overflow/stacking de ancestral o recorta nem o joga
  // atrás dos panes do Leaflet.
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(
    null,
  );

  const recalcularPosicao = useCallback(() => {
    const t = refTrigger.current;
    if (!t) return;
    const r = t.getBoundingClientRect();
    // position: fixed -> coordenadas relativas à viewport (sem somar scroll).
    setPos({ top: r.bottom + 4, left: r.left, width: r.width });
  }, []);

  // Mede a posição assim que abre (antes da pintura, pra não "pular").
  useLayoutEffect(() => {
    if (aberto) recalcularPosicao();
  }, [aberto, recalcularPosicao]);

  // Mantém o painel colado ao trigger durante scroll/resize enquanto aberto.
  useEffect(() => {
    if (!aberto) return;
    function aoAtualizar() {
      recalcularPosicao();
    }
    window.addEventListener('scroll', aoAtualizar, true);
    window.addEventListener('resize', aoAtualizar);
    return () => {
      window.removeEventListener('scroll', aoAtualizar, true);
      window.removeEventListener('resize', aoAtualizar);
    };
  }, [aberto, recalcularPosicao]);

  // Fecha ao clicar fora (considera trigger E painel portado) e ao apertar Esc.
  useEffect(() => {
    if (!aberto) return;
    function aoClicarFora(ev: MouseEvent) {
      const alvo = ev.target as Node;
      if (
        refTrigger.current?.contains(alvo) ||
        refPainel.current?.contains(alvo)
      ) {
        return;
      }
      setAberto(false);
    }
    function aoTeclar(ev: KeyboardEvent) {
      if (ev.key === 'Escape') {
        setAberto(false);
        refTrigger.current?.focus();
      }
    }
    document.addEventListener('mousedown', aoClicarFora);
    document.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('mousedown', aoClicarFora);
      document.removeEventListener('keydown', aoTeclar);
    };
  }, [aberto]);

  const todasMarcadas = selecionadas.length === 0;

  function alternar(entidade: string) {
    if (selecionadas.includes(entidade)) {
      aoMudar(selecionadas.filter((e) => e !== entidade));
    } else {
      const proximas = [...selecionadas, entidade];
      // Selecionou todas as disponíveis = volta pra "todas" (lista vazia).
      aoMudar(proximas.length === disponiveis.length ? [] : proximas);
    }
  }

  function marcarTodas() {
    aoMudar([]); // vazio = todas
  }

  const rotuloBotao = todasMarcadas
    ? 'Todas as entidades'
    : selecionadas.length === 1
      ? selecionadas[0]
      : `${selecionadas.length} entidades`;

  return (
    <div className="flex flex-col gap-1">
      <span id={idLabel} className="text-sm font-medium text-app-fg">
        Entidade responsável
      </span>
      <div className="relative">
        <button
          ref={refTrigger}
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={aberto}
          aria-controls={idListbox}
          aria-labelledby={idLabel}
          className="flex w-full items-center justify-between gap-2 rounded border border-app-border-input bg-app-surface px-3 py-2 text-left text-sm text-app-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul focus-visible:ring-offset-1 focus-visible:ring-offset-app-surface"
        >
          <span className="truncate">{rotuloBotao}</span>
          <ChevronDown
            aria-hidden="true"
            className={`h-4 w-4 shrink-0 text-app-fg-muted transition-transform ${
              aberto ? 'rotate-180' : ''
            }`}
          />
        </button>

        {aberto && pos
          ? createPortal(
              <div
                ref={refPainel}
                id={idListbox}
                role="listbox"
                aria-labelledby={idLabel}
                aria-multiselectable="true"
                // z-[1100] fica acima dos panes e controles do Leaflet (que
                // chegam a ~1000). position: fixed escapa de qualquer overflow
                // ou stacking context do mapa.
                style={{
                  position: 'fixed',
                  top: pos.top,
                  left: pos.left,
                  width: pos.width,
                }}
                className="z-[1100] max-h-72 overflow-y-auto rounded border border-app-border-input bg-app-surface py-1 shadow-lg"
              >
                <button
                  type="button"
                  role="option"
                  aria-selected={todasMarcadas}
                  onClick={marcarTodas}
                  className="flex w-full items-center justify-between px-3 py-2 text-sm text-app-fg hover:bg-app-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gov-azul"
                >
                  <span className="font-medium">Todas as entidades</span>
                  {todasMarcadas ? (
                    <Check className="h-4 w-4 text-gov-azul" aria-hidden="true" />
                  ) : null}
                </button>

                <div
                  className="my-1 h-px bg-app-border-subtle"
                  role="presentation"
                />

                {disponiveis.map((entidade) => {
                  const marcada = selecionadas.includes(entidade);
                  const cor = COR_ENTIDADE.get(entidade) ?? '#94a3b8';
                  return (
                    <button
                      key={entidade}
                      type="button"
                      role="option"
                      aria-selected={marcada}
                      onClick={() => alternar(entidade)}
                      className="flex w-full items-center gap-3 px-3 py-2 text-sm text-app-fg hover:bg-app-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gov-azul"
                    >
                      <span
                        aria-hidden="true"
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                          marcada
                            ? 'border-gov-azul bg-gov-azul'
                            : 'border-app-border-input'
                        }`}
                      >
                        {marcada ? (
                          <Check
                            className="h-3 w-3 text-white"
                            aria-hidden="true"
                          />
                        ) : null}
                      </span>
                      <span
                        aria-hidden="true"
                        className="h-3 w-3 shrink-0 rounded-full ring-1 ring-app-border-subtle"
                        style={{ backgroundColor: cor }}
                      />
                      <span className="truncate">{entidade}</span>
                    </button>
                  );
                })}
              </div>,
              document.body,
            )
          : null}
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
