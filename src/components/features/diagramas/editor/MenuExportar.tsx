'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  ChevronDown,
  Download,
  FileJson,
  FileText,
  Image as ImageIcon,
  Loader2,
  Upload,
} from 'lucide-react';
import type { FormatoExport } from './useExportarDiagrama';

interface Props {
  /** Dispara a exportação no formato escolhido. */
  aoExportar: (formato: FormatoExport) => void;
  /** Abre o seletor de arquivo para importar um JSON. */
  aoImportar: () => void;
  /** Formato em exportação no momento (mostra "gerando..."), ou null. */
  formatoEmAndamento: FormatoExport | null;
}

interface ItemExport {
  formato: FormatoExport;
  rotulo: string;
  descricao: string;
  Icone: typeof ImageIcon;
}

const ITENS: ItemExport[] = [
  {
    formato: 'png',
    rotulo: 'Imagem PNG',
    descricao: 'Imagem do diagrama em alta resolução',
    Icone: ImageIcon,
  },
  {
    formato: 'svg',
    rotulo: 'Imagem SVG',
    descricao: 'Imagem vetorial do diagrama',
    Icone: ImageIcon,
  },
  {
    formato: 'pdf',
    rotulo: 'Documento PDF',
    descricao: 'PDF com cabeçalho institucional',
    Icone: FileText,
  },
  {
    formato: 'json',
    rotulo: 'Arquivo JSON',
    descricao: 'Exporta os dados do diagrama',
    Icone: FileJson,
  },
];

/**
 * Menu suspenso de exportação na faixa azul do editor. Reúne PNG, SVG, PDF,
 * exportar JSON e importar JSON em um único botão para não poluir a toolbar.
 *
 * A11y: gatilho com `aria-haspopup`/`aria-expanded`; lista com `role="menu"` e
 * `role="menuitem"`; fecha com Esc e clique fora; foca o primeiro item ao
 * abrir; cada item operável por teclado. Enquanto um formato está sendo gerado,
 * o item exibe spinner e o menu fica desabilitado (sem disparo duplo).
 */
export function MenuExportar({
  aoExportar,
  aoImportar,
  formatoEmAndamento,
}: Props) {
  const [aberto, setAberto] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const primeiroItemRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const gerando = formatoEmAndamento !== null;

  useEffect(() => {
    if (!aberto) return;
    function aoClicarFora(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setAberto(false);
    }
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') setAberto(false);
    }
    document.addEventListener('mousedown', aoClicarFora);
    document.addEventListener('keydown', aoTeclar);
    requestAnimationFrame(() => primeiroItemRef.current?.focus());
    return () => {
      document.removeEventListener('mousedown', aoClicarFora);
      document.removeEventListener('keydown', aoTeclar);
    };
  }, [aberto]);

  function executar(acao: () => void) {
    setAberto(false);
    acao();
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={menuId}
        aria-label="Exportar ou importar o diagrama"
        title="Exportar (PNG, SVG, PDF, JSON) ou importar JSON"
        className="inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
      >
        {gerando ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
        ) : (
          <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
        )}
        <span className="hidden sm:inline">
          {gerando ? 'Gerando…' : 'Exportar'}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      </button>

      {aberto ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Exportar ou importar"
          className="absolute right-0 z-40 mt-2 w-64 overflow-hidden rounded-gov-card border border-app-border-subtle bg-app-surface text-app-fg shadow-gov-card-hover"
        >
          <p className="border-b border-app-border-subtle px-3 py-2 text-2xs font-semibold uppercase tracking-wide text-app-fg-muted">
            Exportar
          </p>
          {ITENS.map((item, indice) => {
            const ativo = formatoEmAndamento === item.formato;
            return (
              <button
                key={item.formato}
                ref={indice === 0 ? primeiroItemRef : undefined}
                type="button"
                role="menuitem"
                disabled={gerando}
                onClick={() => executar(() => aoExportar(item.formato))}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-app-fg hover:bg-app-surface-2 focus-visible:bg-app-surface-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                {ativo ? (
                  <Loader2
                    className="h-4 w-4 shrink-0 animate-spin text-gov-azul"
                    aria-hidden="true"
                  />
                ) : (
                  <item.Icone
                    className="h-4 w-4 shrink-0 text-app-fg-muted"
                    aria-hidden="true"
                  />
                )}
                <span className="min-w-0">
                  <span className="block font-medium">
                    {ativo ? 'Gerando…' : item.rotulo}
                  </span>
                  <span className="block truncate text-2xs text-app-fg-muted">
                    {item.descricao}
                  </span>
                </span>
              </button>
            );
          })}

          <p className="border-y border-app-border-subtle px-3 py-2 text-2xs font-semibold uppercase tracking-wide text-app-fg-muted">
            Importar
          </p>
          <button
            type="button"
            role="menuitem"
            disabled={gerando}
            onClick={() => executar(aoImportar)}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-app-fg hover:bg-app-surface-2 focus-visible:bg-app-surface-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Upload className="h-4 w-4 shrink-0 text-app-fg-muted" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block font-medium">Importar JSON</span>
              <span className="block truncate text-2xs text-app-fg-muted">
                Substitui o conteúdo atual do diagrama
              </span>
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
