'use client';

import { useEffect, useId, useRef, useState } from 'react';
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
  const decidiuNaMao = useRef(false);

  // No celular a legenda fica recolhida: aberta, cobriria um terço do estado.
  //
  // A largura é acompanhada durante a visita, e não medida uma vez na
  // montagem. Medida só na montagem, quem abria em paisagem e girava para
  // retrato continuava com a legenda aberta cobrindo o mapa, que é justamente
  // o caso em que o aparelho tem menos tela (achado do QA de 22/09/2026).
  //
  // A largura decide enquanto ninguém decidiu: depois que a pessoa usa o botão,
  // ela manda, e girar o aparelho ou redimensionar a janela não desfaz a
  // escolha dela. Sem essa trava, fechar a legenda e mudar a largura a traria
  // de volta sobre o mapa sem que nada tivesse sido pedido, que é o mesmo
  // incômodo do achado, só que ao contrário.
  useEffect(() => {
    const estreita = window.matchMedia('(max-width: 767px)');
    const aplicar = (ehEstreita: boolean) => {
      if (decidiuNaMao.current) return;
      setAberta(!ehEstreita);
    };
    aplicar(estreita.matches);
    const aoMudar = (evento: MediaQueryListEvent) => aplicar(evento.matches);
    estreita.addEventListener('change', aoMudar);
    return () => estreita.removeEventListener('change', aoMudar);
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
        onClick={() => {
          decidiuNaMao.current = true;
          setAberta((a) => !a);
        }}
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
          {/*
            O contador fica FORA do `<label>` de propósito. Dentro dele, o texto
            entrava no nome acessível do checkbox, que passava a se chamar
            "Outras redes (SIBH) carregando" e depois "Outras redes (SIBH) 1.234":
            nome de controle que muda sozinho, e uma região `aria-live` aninhada
            num rótulo, que os leitores de tela tratam de forma inconsistente.
            Separado, o checkbox tem nome estável e a contagem é anunciada como
            status, que é o que ela é.
          */}
          <div className="flex items-center gap-2 border-t border-app-border-subtle pt-2 text-app-fg">
            <label className="flex flex-1 cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={outrasRedes === 'ligada' || outrasRedes === 'carregando'}
                onChange={aoAlternarOutrasRedes}
                className="h-3.5 w-3.5 accent-gov-azul"
              />
              <svg aria-hidden="true" width="10" height="10" viewBox="0 0 12 12">
                <circle cx="6" cy="6" r="3.6" fill={COR_OUTRAS_REDES} opacity="0.7" />
              </svg>
              <span>Outras redes (SIBH)</span>
            </label>
            <span className="tabular-nums text-app-fg-muted" role="status">
              {outrasRedes === 'carregando' && 'carregando'}
              {outrasRedes === 'ligada' && fmt(totalOutrasRedes)}
              {outrasRedes === 'erro' && 'indisponível'}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
