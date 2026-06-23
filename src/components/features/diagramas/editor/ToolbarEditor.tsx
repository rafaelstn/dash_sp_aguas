'use client';

import {
  CloudRain,
  Gauge,
  MousePointer2,
  Pencil,
  Redo2,
  Trash2,
  Undo2,
  Waves,
  Workflow,
} from 'lucide-react';
import type { Ferramenta } from './tipos-editor';

interface Props {
  ferramenta: Ferramenta;
  aoTrocarFerramenta: (f: Ferramenta) => void;
  temSelecao: boolean;
  aoEditar: () => void;
  aoExcluir: () => void;
  podeDesfazer: boolean;
  podeRefazer: boolean;
  aoDesfazer: () => void;
  aoRefazer: () => void;
}

interface ItemFerramenta {
  id: Ferramenta;
  rotulo: string;
  dica: string;
  Icone: typeof MousePointer2;
}

const FERRAMENTAS: ItemFerramenta[] = [
  {
    id: 'selecionar',
    rotulo: 'Selecionar',
    dica: 'Selecionar e mover elementos',
    Icone: MousePointer2,
  },
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
 * Toolbar do editor, fiel ao SIBH e reorganizada por UX para não ficar
 * "encavalada": três blocos lógicos com respiro e separadores claros —
 * Ferramentas (selecionar + adicionar) | Histórico (desfazer/refazer) |
 * Edição (editar/excluir). Cada bloco é um segmento visual; entre blocos há
 * divisória vertical e espaçamento generoso (gap-3). Em telas estreitas os
 * rótulos colapsam, restando ícone + tooltip acessível.
 *
 * A11y: `role=toolbar`; cada ferramenta é `button` com `aria-pressed`,
 * `aria-label` e `title`. Operável por teclado (Tab + Enter/Espaço). Foco
 * visível com outline branco sobre a faixa azul.
 */
export function ToolbarEditor({
  ferramenta,
  aoTrocarFerramenta,
  temSelecao,
  aoEditar,
  aoExcluir,
  podeDesfazer,
  podeRefazer,
  aoDesfazer,
  aoRefazer,
}: Props) {
  return (
    <div
      role="toolbar"
      aria-label="Ferramentas do editor"
      className="flex flex-wrap items-center gap-x-3 gap-y-2"
    >
      {/* Bloco 1 — Ferramentas (segmento branco translúcido) */}
      <div
        role="group"
        aria-label="Ferramentas de desenho"
        className="flex items-center gap-1 rounded-lg bg-white/10 p-1"
      >
        {FERRAMENTAS.map((item) => (
          <BotaoFerramenta
            key={item.id}
            item={item}
            ativo={ferramenta === item.id}
            aoClicar={() => aoTrocarFerramenta(item.id)}
          />
        ))}
      </div>

      <Divisoria />

      {/* Bloco 2 — Histórico */}
      <div role="group" aria-label="Histórico" className="flex items-center gap-1">
        <BotaoAcao
          rotulo="Desfazer"
          dica="Desfazer a última ação (Ctrl+Z)"
          Icone={Undo2}
          aoClicar={aoDesfazer}
          desabilitado={!podeDesfazer}
        />
        <BotaoAcao
          rotulo="Refazer"
          dica="Refazer a ação desfeita (Ctrl+Shift+Z)"
          Icone={Redo2}
          aoClicar={aoRefazer}
          desabilitado={!podeRefazer}
        />
      </div>

      <Divisoria />

      {/* Bloco 3 — Edição do elemento selecionado */}
      <div role="group" aria-label="Edição" className="flex items-center gap-1">
        <BotaoAcao
          rotulo="Editar"
          dica="Editar o elemento selecionado (Enter)"
          Icone={Pencil}
          aoClicar={aoEditar}
          desabilitado={!temSelecao}
        />
        <BotaoAcao
          rotulo="Excluir"
          dica="Excluir o elemento selecionado (Delete)"
          Icone={Trash2}
          aoClicar={aoExcluir}
          desabilitado={!temSelecao}
          perigo
        />
      </div>
    </div>
  );
}

/** Divisória vertical entre blocos (some no mobile, onde os blocos quebram). */
function Divisoria() {
  return (
    <span
      className="hidden h-6 w-px self-center bg-white/25 sm:inline-block"
      aria-hidden="true"
    />
  );
}

/** Botão de ferramenta (estado ativo = pílula branca, padrão SIBH). */
function BotaoFerramenta({
  item,
  ativo,
  aoClicar,
}: {
  item: ItemFerramenta;
  ativo: boolean;
  aoClicar: () => void;
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      aria-pressed={ativo}
      aria-label={item.rotulo}
      title={item.dica}
      className={[
        'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors duration-150',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
        ativo
          ? 'bg-white text-gov-azul shadow-sm'
          : 'text-white hover:bg-white/15',
      ].join(' ')}
    >
      <item.Icone className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="hidden lg:inline">{item.rotulo}</span>
    </button>
  );
}

/** Botão de ação (histórico/edição). `perigo` tinge o hover de vermelho. */
function BotaoAcao({
  rotulo,
  dica,
  Icone,
  aoClicar,
  desabilitado,
  perigo = false,
}: {
  rotulo: string;
  dica: string;
  Icone: typeof MousePointer2;
  aoClicar: () => void;
  desabilitado: boolean;
  perigo?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      disabled={desabilitado}
      aria-label={rotulo}
      title={dica}
      className={[
        'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-white transition-colors duration-150',
        'disabled:cursor-not-allowed disabled:opacity-40',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
        perigo ? 'hover:bg-red-500/30' : 'hover:bg-white/15',
      ].join(' ')}
    >
      <Icone className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="hidden lg:inline">{rotulo}</span>
    </button>
  );
}
