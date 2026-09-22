'use client';

import { useEffect, useId, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import {
  SITUACOES_POSTO,
  TIPOS_POSTO_MAPA,
  type PontoMapaPosto,
  type TipoPostoMapa,
} from '@/domain/mapa-postos';
import { GlifoPosto } from './GlifoPosto';
import { GlifoSituacao } from './FiltrosPostos';
import { COR_OUTRAS_REDES, ESTILO_TIPO, ROTULO_SITUACAO } from './simbolos';
import type { EstadoTela } from './estado-url';

/**
 * Legenda do mapa. Conta o que está NA ÁREA VISÍVEL, e o título diz isso; os
 * chips de filtro contam o total. As duas contagens respondem perguntas
 * diferentes ("o que estou vendo aqui" e "quantos existem com este filtro"), e
 * foi por isso que não se unificaram.
 */

export type EstadoOutrasRedes = 'desligada' | 'carregando' | 'ligada' | 'erro';

interface LegendaMapaProps {
  readonly estado: EstadoTela;
  readonly naArea: readonly PontoMapaPosto[];
  readonly outrasRedes: EstadoOutrasRedes;
  readonly totalOutrasRedes: number;
  readonly aoAlternarOutrasRedes: () => void;
}

const fmt = (n: number) => n.toLocaleString('pt-BR');

export function LegendaMapa({
  estado,
  naArea,
  outrasRedes,
  totalOutrasRedes,
  aoAlternarOutrasRedes,
}: LegendaMapaProps) {
  const [aberta, setAberta] = useState(true);
  const idCorpo = useId();

  // No celular a legenda nasce recolhida: aberta, cobriria um terço do estado.
  useEffect(() => {
    if (window.matchMedia('(max-width: 767px)').matches) setAberta(false);
  }, []);

  const porTipo = new Map<TipoPostoMapa, number>();
  for (const p of naArea) if (p.tipo) porTipo.set(p.tipo, (porTipo.get(p.tipo) ?? 0) + 1);

  return (
    <section
      aria-label="Legenda do mapa"
      className="absolute bottom-3 left-3 z-[800] max-w-[calc(100%-4.5rem)] rounded-md bg-white/95 text-xs shadow-gov-card"
    >
      <button
        type="button"
        aria-expanded={aberta}
        aria-controls={idCorpo}
        onClick={() => setAberta((a) => !a)}
        className="flex w-full items-center gap-1.5 rounded-md px-3 py-2 text-left font-medium text-app-fg focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gov-azul"
      >
        {aberta ? (
          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        Legenda
      </button>
      {aberta && (
        <div id={idCorpo} className="w-56 space-y-2 px-3 pb-3">
          <p className="text-2xs uppercase tracking-wide text-app-fg-subtle">Nesta área do mapa</p>
          <ul className="space-y-1">
            {TIPOS_POSTO_MAPA.map((t) => {
              const ligado = estado.tipos.includes(t);
              return (
                <li key={t} className="flex items-center gap-2">
                  <GlifoPosto tipo={t} tamanho={11} />
                  <span className={`flex-1 ${ligado ? 'text-app-fg' : 'text-app-fg-subtle'}`}>
                    {ESTILO_TIPO[t].nome}
                  </span>
                  <span className="tabular-nums text-app-fg-muted">
                    {ligado ? fmt(porTipo.get(t) ?? 0) : 'fora do filtro'}
                  </span>
                </li>
              );
            })}
          </ul>
          <ul className="space-y-1 border-t border-app-border-subtle pt-2">
            {SITUACOES_POSTO.map((s) => (
              <li key={s} className="flex items-center gap-2 text-app-fg">
                <GlifoSituacao extinto={s === 'extinto'} />
                {s === 'extinto' ? 'Extinto (vazado)' : `${ROTULO_SITUACAO[s]} (cheio)`}
              </li>
            ))}
          </ul>
          <label className="flex cursor-pointer items-center gap-2 border-t border-app-border-subtle pt-2 text-app-fg">
            <input
              type="checkbox"
              checked={outrasRedes === 'ligada' || outrasRedes === 'carregando'}
              onChange={aoAlternarOutrasRedes}
              className="h-3.5 w-3.5 accent-gov-azul"
            />
            <svg aria-hidden="true" width="10" height="10" viewBox="0 0 12 12">
              <circle cx="6" cy="6" r="3.6" fill={COR_OUTRAS_REDES} opacity="0.7" />
            </svg>
            <span className="flex-1">Outras redes (SIBH)</span>
            <span className="tabular-nums text-app-fg-muted" aria-live="polite">
              {outrasRedes === 'carregando' && 'carregando'}
              {outrasRedes === 'ligada' && fmt(totalOutrasRedes)}
              {outrasRedes === 'erro' && 'indisponível'}
            </span>
          </label>
        </div>
      )}
    </section>
  );
}
