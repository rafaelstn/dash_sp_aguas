'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Link2, Link2Off, Loader2, Search } from 'lucide-react';

/** Forma enxuta devolvida por GET /api/postos/buscar (itens[]). */
export interface PostoSugestao {
  prefixo: string;
  nome: string | null;
  tipoPosto: string | null;
  prefixoAna: string | null;
}

interface Props {
  /** Prefixo do posto vinculado, ou null/undefined quando sem vínculo. */
  postoId: string | null | undefined;
  /** Vincula: grava postoId + propaga código e nome do posto escolhido. */
  aoVincular: (posto: PostoSugestao) => void;
  /** Desvincula: zera o postoId (código e nome continuam editáveis). */
  aoDesvincular: () => void;
  /** Id base para amarrar label/aria do campo. */
  baseId: string;
  /** Classe do label, reaproveitada do modal para consistência visual. */
  classeLabel: string;
}

const DEBOUNCE_MS = 250;
const LIMITE = 20;
const TERMO_MINIMO = 2;

type EstadoBusca =
  | { fase: 'ocioso' }
  | { fase: 'carregando' }
  | { fase: 'ok'; itens: PostoSugestao[] }
  | { fase: 'erro' };

/**
 * Busca/autocomplete de posto do catálogo, para vincular um posto de nível ou
 * chuva a um posto real (o prefixo é a chave da telemetria). Combobox acessível
 * (WAI-ARIA combobox + listbox): role/aria-expanded/aria-activedescendant,
 * navegação por teclado (setas, Enter, Esc, Home/End) e foco visível. Estados
 * cobertos: ocioso (termo curto), carregando, vazio, erro (degradação graciosa,
 * não quebra o modal) e lista de sugestões.
 *
 * Quando há vínculo, mostra um indicador "Vinculado ao catálogo" com o prefixo
 * e um botão "Desvincular"; sem vínculo, o usuário pode buscar e selecionar, e
 * o campo Código do modal continua editável como texto solto.
 */
export function BuscaPosto({
  postoId,
  aoVincular,
  aoDesvincular,
  baseId,
  classeLabel,
}: Props) {
  const [termo, setTermo] = useState('');
  const [estado, setEstado] = useState<EstadoBusca>({ fase: 'ocioso' });
  const [aberto, setAberto] = useState(false);
  const [indiceAtivo, setIndiceAtivo] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const inputId = `${baseId}-busca-posto`;
  const listaId = `${baseId}-busca-posto-lista`;
  const statusId = `${baseId}-busca-posto-status`;

  const vinculado = Boolean(postoId);

  // Busca com debounce. Cancela requisições obsoletas (AbortController) para o
  // resultado refletir sempre o termo mais recente. Termo curto nem dispara.
  useEffect(() => {
    const termoLimpo = termo.trim();
    if (termoLimpo.length < TERMO_MINIMO) {
      setEstado({ fase: 'ocioso' });
      return;
    }

    const controlador = new AbortController();
    const t = setTimeout(async () => {
      setEstado({ fase: 'carregando' });
      try {
        const resp = await fetch(
          `/api/postos/buscar?q=${encodeURIComponent(termoLimpo)}&limite=${LIMITE}`,
          { signal: controlador.signal },
        );
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const dados: { total: number; itens: PostoSugestao[] } = await resp.json();
        setEstado({ fase: 'ok', itens: dados.itens ?? [] });
        setIndiceAtivo(dados.itens && dados.itens.length > 0 ? 0 : -1);
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setEstado({ fase: 'erro' });
        setIndiceAtivo(-1);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(t);
      controlador.abort();
    };
  }, [termo]);

  // Fecha a lista ao clicar fora do componente.
  useEffect(() => {
    if (!aberto) return;
    function aoClicarFora(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener('mousedown', aoClicarFora);
    return () => document.removeEventListener('mousedown', aoClicarFora);
  }, [aberto]);

  const itens = estado.fase === 'ok' ? estado.itens : [];

  function selecionar(posto: PostoSugestao) {
    aoVincular(posto);
    setAberto(false);
    setTermo('');
    setEstado({ fase: 'ocioso' });
    setIndiceAtivo(-1);
  }

  function aoTeclar(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!aberto) setAberto(true);
      if (itens.length > 0) {
        setIndiceAtivo((i) => (i + 1) % itens.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (itens.length > 0) {
        setIndiceAtivo((i) => (i <= 0 ? itens.length - 1 : i - 1));
      }
    } else if (e.key === 'Home' && itens.length > 0) {
      e.preventDefault();
      setIndiceAtivo(0);
    } else if (e.key === 'End' && itens.length > 0) {
      e.preventDefault();
      setIndiceAtivo(itens.length - 1);
    } else if (e.key === 'Enter') {
      // Com a lista aberta, o Enter nunca deve submeter o formulário do modal:
      // ou confirma a sugestão ativa, ou é absorvido (impede o submit acidental
      // enquanto o usuário ainda está escolhendo um posto).
      if (aberto) {
        e.preventDefault();
        if (indiceAtivo >= 0 && itens[indiceAtivo]) {
          selecionar(itens[indiceAtivo]);
        }
      }
    } else if (e.key === 'Escape') {
      if (aberto) {
        e.preventDefault();
        e.stopPropagation();
        setAberto(false);
      }
    }
  }

  // Estado VINCULADO: indicador discreto + desvincular. A busca fica oculta
  // para deixar claro que o vínculo está ativo (desvincular reabre a busca).
  if (vinculado) {
    return (
      <div className="space-y-1">
        <span className={classeLabel}>Posto do catálogo</span>
        <div className="flex items-center justify-between gap-2 rounded border border-gov-azul/30 bg-gov-azul/5 px-3 py-2">
          <span className="flex min-w-0 items-center gap-2 text-sm text-app-fg">
            <Link2 className="h-4 w-4 shrink-0 text-gov-azul" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block font-medium text-gov-azul">
                Vinculado ao catálogo
              </span>
              <span className="block truncate text-xs text-app-fg-muted">
                Prefixo {postoId}
              </span>
            </span>
          </span>
          <button
            type="button"
            onClick={aoDesvincular}
            className="inline-flex shrink-0 items-center gap-1.5 rounded border border-app-border-subtle bg-app-surface px-2.5 py-1.5 text-xs font-medium text-app-fg hover:bg-app-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
          >
            <Link2Off className="h-3.5 w-3.5" aria-hidden="true" />
            Desvincular
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1" ref={containerRef}>
      <label htmlFor={inputId} className={classeLabel}>
        Buscar posto no catálogo
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-app-fg-subtle"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          role="combobox"
          aria-expanded={aberto}
          aria-controls={listaId}
          aria-autocomplete="list"
          aria-activedescendant={
            aberto && indiceAtivo >= 0 ? `${listaId}-opt-${indiceAtivo}` : undefined
          }
          aria-describedby={statusId}
          autoComplete="off"
          value={termo}
          onChange={(e) => {
            setTermo(e.target.value);
            setAberto(true);
          }}
          onFocus={() => {
            if (termo.trim().length >= TERMO_MINIMO) setAberto(true);
          }}
          onKeyDown={aoTeclar}
          placeholder="Prefixo, nome ou rio (ex.: Tietê)"
          className="w-full rounded border border-app-border-input bg-app-surface py-1.5 pl-8 pr-3 text-sm text-app-fg placeholder:text-app-fg-subtle focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
        />

        {aberto ? (
          <div className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded border border-app-border-subtle bg-app-surface shadow-gov-card-hover">
            {estado.fase === 'carregando' ? (
              <p className="flex items-center gap-2 px-3 py-2 text-sm text-app-fg-muted">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Buscando postos...
              </p>
            ) : null}

            {estado.fase === 'erro' ? (
              <p className="px-3 py-2 text-sm text-gov-perigo">
                Não foi possível buscar agora. Tente novamente ou digite o
                código manualmente abaixo.
              </p>
            ) : null}

            {estado.fase === 'ok' && itens.length === 0 ? (
              <p className="px-3 py-2 text-sm text-app-fg-muted">
                Nenhum posto encontrado.
              </p>
            ) : null}

            {estado.fase === 'ok' && itens.length > 0 ? (
              <ul id={listaId} role="listbox" aria-label="Postos encontrados">
                {itens.map((posto, indice) => {
                  const ativo = indice === indiceAtivo;
                  return (
                    <li
                      key={posto.prefixo}
                      id={`${listaId}-opt-${indice}`}
                      role="option"
                      aria-selected={ativo}
                      onMouseDown={(e) => {
                        // mousedown (não click) para selecionar antes do blur
                        // do input fechar a lista.
                        e.preventDefault();
                        selecionar(posto);
                      }}
                      onMouseEnter={() => setIndiceAtivo(indice)}
                      className={[
                        'flex cursor-pointer items-start gap-2 px-3 py-2 text-sm',
                        ativo ? 'bg-gov-azul/10' : 'hover:bg-app-surface-2',
                      ].join(' ')}
                    >
                      <Check
                        className={[
                          'mt-0.5 h-4 w-4 shrink-0',
                          ativo ? 'text-gov-azul' : 'text-transparent',
                        ].join(' ')}
                        aria-hidden="true"
                      />
                      <span className="min-w-0">
                        <span className="block font-medium text-app-fg">
                          {posto.prefixo}
                          {posto.nome ? (
                            <span className="font-normal text-app-fg-muted">
                              {' '}
                              · {posto.nome}
                            </span>
                          ) : null}
                        </span>
                        {posto.tipoPosto ? (
                          <span className="block text-xs text-app-fg-subtle">
                            {posto.tipoPosto}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Status para leitor de tela (aria-live): anuncia resultado/erro sem
          roubar o foco do campo de busca. */}
      <span id={statusId} role="status" aria-live="polite" className="sr-only">
        {estado.fase === 'carregando'
          ? 'Buscando postos'
          : estado.fase === 'erro'
            ? 'Erro ao buscar postos'
            : estado.fase === 'ok'
              ? `${itens.length} ${itens.length === 1 ? 'posto encontrado' : 'postos encontrados'}`
              : ''}
      </span>
    </div>
  );
}
