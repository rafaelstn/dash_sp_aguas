'use client';

import {
  CloudRain,
  Dam,
  Gauge,
  MousePointer2,
  PanelTopClose,
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
    id: 'barragem',
    rotulo: 'Barragem',
    dica: 'Clique no canvas para adicionar uma barragem',
    Icone: Dam,
  },
  {
    id: 'comporta',
    rotulo: 'Comporta',
    dica: 'Clique no canvas para adicionar uma comporta',
    Icone: PanelTopClose,
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
 * Toolbar do editor, padrão SIBH (faixa azul, ferramenta ativa = pílula
 * branca). Reorganizada por UX para NUNCA quebrar em segunda linha órfã na
 * faixa do topo, mesmo no pior caso (sidebar do dashboard expandida).
 *
 * Estratégia de densidade:
 *   - Ferramentas (grupo principal): segmento agrupado. O rótulo aparece só na
 *     ferramenta ATIVA (a pílula branca ganha texto e contexto); as inativas
 *     ficam só com ícone. Abaixo de `md` tudo vira só-ícone. O grupo é compacto
 *     por construção, então não é ele que estoura.
 *   - Histórico (desfazer/refazer) e Edição (editar/excluir): ações
 *     secundárias, sempre só-ícone, sem rótulo (tooltip + aria-label dão o
 *     nome). Economizam largura.
 *   - Container `flex-nowrap`: nada quebra de linha. Como os grupos secundários
 *     já são compactos, tudo cabe em uma faixa, da sidebar expandida ao mobile.
 *
 * A11y (e-MAG / WCAG 2.1 AA): `role=toolbar`; cada grupo é `role=group` com
 * `aria-label`; ferramentas são `button` com `aria-pressed`, `aria-label` e
 * `title`. Operável por teclado (Tab + Enter/Espaço). Foco visível com outline
 * branco sobre a faixa azul.
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
      className="flex min-w-0 flex-nowrap items-center gap-2"
    >
      {/* Grupo 1 — Ferramentas de desenho (segmento branco translúcido) */}
      <div
        role="group"
        aria-label="Ferramentas de desenho"
        className="flex shrink-0 items-center gap-1 rounded-lg bg-white/10 p-1"
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

      {/* Grupo 2 — Histórico (só-ícone) */}
      <div
        role="group"
        aria-label="Histórico"
        className="flex shrink-0 items-center gap-1"
      >
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

      {/* Grupo 3 — Edição do elemento selecionado (só-ícone) */}
      <div
        role="group"
        aria-label="Edição"
        className="flex shrink-0 items-center gap-1"
      >
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

/** Divisória vertical entre grupos (some no mobile, onde o respiro já basta). */
function Divisoria() {
  return (
    <span
      className="hidden h-6 w-px shrink-0 self-center bg-white/25 sm:inline-block"
      aria-hidden="true"
    />
  );
}

/**
 * Botão de ferramenta. Estado ativo = pílula branca com rótulo (padrão SIBH);
 * inativa = só ícone, para manter o grupo compacto. Abaixo de `md`, mesmo a
 * ativa fica só-ícone (a faixa do topo é mais disputada no mobile).
 */
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
        'inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors duration-150',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
        ativo
          ? 'bg-white text-gov-azul shadow-sm'
          : 'text-white hover:bg-white/15',
      ].join(' ')}
    >
      <item.Icone className="h-4 w-4 shrink-0" aria-hidden="true" />
      {/* Rótulo só na ferramenta ativa e a partir de md: dá contexto sem
          inflar o grupo nem disputar largura na faixa. */}
      {ativo ? (
        <span className="hidden max-w-[10rem] truncate md:inline">
          {item.rotulo}
        </span>
      ) : null}
    </button>
  );
}

/**
 * Botão de ação secundária (histórico/edição). Sempre só-ícone: o nome vem do
 * `aria-label` + `title`. `perigo` tinge o hover de vermelho.
 */
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
        'inline-flex items-center justify-center rounded-md p-1.5 text-white transition-colors duration-150',
        'disabled:cursor-not-allowed disabled:opacity-40',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white',
        perigo ? 'hover:bg-red-500/30' : 'hover:bg-white/15',
      ].join(' ')}
    >
      <Icone className="h-4 w-4 shrink-0" aria-hidden="true" />
    </button>
  );
}
