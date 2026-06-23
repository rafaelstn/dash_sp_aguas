'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';

export interface BotaoExportarRelatorioProps {
  prefixo: string;
  /**
   * Data da última varredura global do acervo. Quando > 48h, o botão é
   * desabilitado e exibe tooltip LGPD. Na v1 (sem sweep noturno), passar
   * `null` — o botão fica habilitado com aviso genérico.
   */
  ultimaVarreduraGlobal: Date | null;
}

const LIMITE_VARREDURA_HORAS = 48;

/**
 * Botão de exportação de relatório oficial (PDF/XLSX).
 *
 * Baixa via fetch + blob (em vez de navegar a janela) para conseguir
 * mostrar estados de carregamento e de erro sem trocar de página. Se a
 * rota responder erro, exibe mensagem acessível (role="alert") logo abaixo.
 *
 * Regra de bloqueio (Fase 2 — sweep noturno):
 * - Se `ultimaVarreduraGlobal > 48h` atrás, botão desabilitado + tooltip LGPD.
 *
 * V1 (sem sweep): botão sempre habilitado, exibe aviso genérico sobre
 * indexação sob demanda.
 */
export function BotaoExportarRelatorio({
  prefixo,
  ultimaVarreduraGlobal,
}: BotaoExportarRelatorioProps) {
  const [exportando, setExportando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const bloqueado =
    ultimaVarreduraGlobal !== null &&
    Date.now() - ultimaVarreduraGlobal.getTime() >
      LIMITE_VARREDURA_HORAS * 60 * 60 * 1000;

  const tooltip = bloqueado
    ? 'Disponível após a próxima varredura completa do acervo (LGPD).'
    : ultimaVarreduraGlobal === null
      ? 'Relatório gerado a partir de indexação sob demanda, pode não refletir a totalidade do acervo.'
      : 'Exportar relatório oficial (PDF/XLSX).';

  function nomeDoArquivo(resp: Response): string {
    const disposicao = resp.headers.get('content-disposition') ?? '';
    const casado = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposicao);
    if (casado?.[1]) return decodeURIComponent(casado[1]);
    return `relatorio-posto-${prefixo}`;
  }

  async function exportar() {
    if (exportando || bloqueado) return;
    setExportando(true);
    setErro(null);
    try {
      const resp = await fetch(
        `/api/postos/${encodeURIComponent(prefixo)}/relatorio`,
        { credentials: 'same-origin' },
      );
      if (!resp.ok) {
        const corpo = (await resp.json().catch(() => ({}))) as {
          erro?: string;
          mensagem?: string;
        };
        throw new Error(
          corpo.mensagem ??
            corpo.erro ??
            `Falha ao gerar o relatório (HTTP ${resp.status}).`,
        );
      }
      // Dispara o download a partir do blob, sem sair da página.
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nomeDoArquivo(resp);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErro(
        e instanceof Error
          ? e.message
          : 'Não foi possível gerar o relatório. Tente novamente em instantes.',
      );
    } finally {
      setExportando(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={exportar}
        disabled={bloqueado || exportando}
        title={tooltip}
        aria-label={
          bloqueado
            ? `Exportar relatório do posto ${prefixo}, indisponível: ${tooltip}`
            : `Exportar relatório do posto ${prefixo}`
        }
        aria-disabled={bloqueado}
        className="inline-flex items-center gap-1.5 rounded border border-gov-azul bg-app-surface px-3 py-1.5 text-xs font-medium text-gov-azul hover:bg-gov-azul hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul disabled:cursor-not-allowed disabled:border-app-border disabled:bg-app-surface-2 disabled:text-app-fg-muted disabled:hover:bg-app-surface-2 disabled:hover:text-app-fg-muted"
      >
        {exportando ? (
          <Loader2
            className="h-3.5 w-3.5 motion-safe:animate-spin"
            aria-hidden="true"
          />
        ) : (
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {exportando ? 'Preparando…' : 'Exportar relatório'}
      </button>
      {erro ? (
        <p role="alert" className="max-w-[16rem] text-right text-2xs text-gov-perigo">
          {erro}
        </p>
      ) : null}
    </div>
  );
}
