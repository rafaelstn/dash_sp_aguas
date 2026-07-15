'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';

export interface BotaoExportarExcelProps {
  /** URL do export (com a querystring dos filtros ja montada). */
  url: string;
  /** Rotulo textual do botao. Padrao: "Exportar Excel". */
  rotulo?: string;
  /** Nome de arquivo usado caso o servidor nao envie Content-Disposition. */
  arquivoFallback: string;
  /** Variante compacta (para cabecalho de secao dentro de drawer). */
  compacto?: boolean;
  /** Descricao acessivel/tooltip do que sera exportado. */
  descricao?: string;
}

const CLASSES_PADRAO =
  'inline-flex items-center gap-2 rounded border border-gov-azul bg-app-surface px-3 py-1.5 text-sm font-medium text-gov-azul hover:bg-gov-azul hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-app-surface disabled:hover:text-gov-azul';

const CLASSES_COMPACTO =
  'inline-flex items-center gap-1.5 rounded border border-app-border-input px-2.5 py-1.5 text-xs font-medium text-app-fg hover:bg-app-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent';

/**
 * Botao de exportacao para Excel (XLSX) do modulo de Estoque. E uma acao de
 * LEITURA (qualquer usuario logado pode exportar o que consegue ver).
 *
 * Baixa via fetch + blob (em vez de navegar a janela) para conseguir mostrar
 * estados de "gerando" e de erro sem trocar de pagina; a auth por cookie de
 * sessao segue no fetch (`credentials: 'same-origin'`). O nome do arquivo vem
 * do Content-Disposition do servidor, com fallback local.
 *
 * A11y: rotulo textual (nao so icone), foco visivel, `aria-busy` enquanto gera
 * e mensagem de erro em `role="alert"`.
 */
export function BotaoExportarExcel({
  url,
  rotulo = 'Exportar Excel',
  arquivoFallback,
  compacto = false,
  descricao,
}: BotaoExportarExcelProps) {
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function nomeDoArquivo(resp: Response): string {
    const disposicao = resp.headers.get('content-disposition') ?? '';
    const casado = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposicao);
    if (casado?.[1]) {
      try {
        return decodeURIComponent(casado[1]);
      } catch {
        return casado[1];
      }
    }
    return arquivoFallback.endsWith('.xlsx') ? arquivoFallback : `${arquivoFallback}.xlsx`;
  }

  async function exportar() {
    if (gerando) return;
    setGerando(true);
    setErro(null);
    try {
      const resp = await fetch(url, { credentials: 'same-origin' });
      if (!resp.ok) {
        const corpo = (await resp.json().catch(() => ({}))) as {
          erro?: string;
          mensagem?: string;
        };
        throw new Error(
          corpo.mensagem ??
            corpo.erro ??
            `Falha ao gerar a planilha (HTTP ${resp.status}).`,
        );
      }
      // Dispara o download a partir do blob, sem sair da pagina.
      const blob = await resp.blob();
      const objeto = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objeto;
      a.download = nomeDoArquivo(resp);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objeto);
    } catch (e) {
      setErro(
        e instanceof Error
          ? e.message
          : 'Não foi possível gerar a planilha. Tente novamente em instantes.',
      );
    } finally {
      setGerando(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={exportar}
        disabled={gerando}
        aria-busy={gerando}
        title={descricao}
        className={compacto ? CLASSES_COMPACTO : CLASSES_PADRAO}
      >
        {gerando ? (
          <Loader2
            className={`${compacto ? 'h-3.5 w-3.5' : 'h-4 w-4'} motion-safe:animate-spin`}
            aria-hidden="true"
          />
        ) : (
          <Download className={compacto ? 'h-3.5 w-3.5' : 'h-4 w-4'} aria-hidden="true" />
        )}
        {gerando ? 'Gerando…' : rotulo}
      </button>
      {erro ? (
        <p role="alert" className="max-w-[18rem] text-2xs text-gov-perigo">
          {erro}
        </p>
      ) : null}
    </div>
  );
}
