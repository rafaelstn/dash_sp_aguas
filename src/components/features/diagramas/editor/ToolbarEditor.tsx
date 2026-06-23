'use client';

import {
  CloudRain,
  Gauge,
  MousePointer2,
  Trash2,
  Waves,
  Workflow,
} from 'lucide-react';
import type { Ferramenta } from './tipos-editor';

interface Props {
  ferramenta: Ferramenta;
  aoTrocarFerramenta: (f: Ferramenta) => void;
  temSelecao: boolean;
  aoExcluir: () => void;
}

interface ItemFerramenta {
  id: Ferramenta;
  rotulo: string;
  dica: string;
  Icone: typeof MousePointer2;
}

const SELECIONAR: ItemFerramenta = {
  id: 'selecionar',
  rotulo: 'Selecionar',
  dica: 'Selecionar e mover elementos',
  Icone: MousePointer2,
};

const ADICIONAR: ItemFerramenta[] = [
  {
    id: 'reservatorio',
    rotulo: 'Reservatório',
    dica: 'Clique no canvas para adicionar um reservatório',
    Icone: Waves,
  },
  {
    id: 'nivel',
    rotulo: 'Posto de nível',
    dica: 'Clique no canvas para adicionar um posto de nível',
    Icone: Gauge,
  },
  {
    id: 'chuva',
    rotulo: 'Posto de chuva',
    dica: 'Clique no canvas para adicionar um posto de chuva',
    Icone: CloudRain,
  },
  {
    id: 'linha',
    rotulo: 'Rio',
    dica: 'Clique no canvas para adicionar um trecho de rio',
    Icone: Workflow,
  },
];

/**
 * Toolbar do editor (padrão SIBH), na faixa azul do topo. Cada ferramenta é um
 * `button` com `aria-pressed` (estado da ferramenta ativa), `title` e
 * `aria-label` (tooltip nativo acessível, sem dependência externa). Operável
 * por teclado (Tab + Enter/Espaço). No mobile os rótulos colapsam, restando o
 * ícone com `aria-label`.
 */
export function ToolbarEditor({
  ferramenta,
  aoTrocarFerramenta,
  temSelecao,
  aoExcluir,
}: Props) {
  function botao(item: ItemFerramenta) {
    const ativo = ferramenta === item.id;
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => aoTrocarFerramenta(item.id)}
        aria-pressed={ativo}
        aria-label={item.rotulo}
        title={item.dica}
        className={[
          'inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition-colors',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
          ativo
            ? 'bg-white text-gov-azul'
            : 'text-white hover:bg-white/15',
        ].join(' ')}
      >
        <item.Icone className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="hidden sm:inline">{item.rotulo}</span>
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label="Ferramentas do editor">
      {botao(SELECIONAR)}

      <span className="mx-1 hidden h-5 w-px bg-white/30 sm:inline-block" aria-hidden="true" />

      {ADICIONAR.map(botao)}

      <span className="mx-1 hidden h-5 w-px bg-white/30 sm:inline-block" aria-hidden="true" />

      <button
        type="button"
        onClick={aoExcluir}
        disabled={!temSelecao}
        aria-label="Excluir elemento selecionado"
        title="Excluir o elemento selecionado (Delete)"
        className="inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        <Trash2 className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="hidden sm:inline">Excluir</span>
      </button>
    </div>
  );
}
