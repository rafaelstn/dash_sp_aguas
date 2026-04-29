'use client';

import { useState } from 'react';

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
 * Regra de bloqueio (Fase 2 — sweep noturno):
 * - Se `ultimaVarreduraGlobal > 48h` atrás → botão desabilitado + tooltip LGPD.
 *
 * V1 (sem sweep): botão sempre habilitado, exibe aviso genérico sobre
 * indexação sob demanda.
 */
export function BotaoExportarRelatorio({
  prefixo,
  ultimaVarreduraGlobal,
}: BotaoExportarRelatorioProps) {
  const [exportando, setExportando] = useState(false);

  const bloqueado =
    ultimaVarreduraGlobal !== null &&
    Date.now() - ultimaVarreduraGlobal.getTime() >
      LIMITE_VARREDURA_HORAS * 60 * 60 * 1000;

  const tooltip = bloqueado
    ? 'Disponível após próxima varredura completa do acervo (LGPD).'
    : ultimaVarreduraGlobal === null
      ? 'Relatório gerado a partir de indexação sob demanda — pode não refletir a totalidade do acervo.'
      : 'Exportar relatório oficial (PDF/XLSX).';

  async function exportar() {
    setExportando(true);
    try {
      window.location.href = `/api/postos/${encodeURIComponent(prefixo)}/relatorio`;
    } finally {
      setExportando(false);
    }
  }

  return (
    <button
      type="button"
      onClick={exportar}
      disabled={bloqueado || exportando}
      title={tooltip}
      aria-label={
        bloqueado
          ? `Exportar relatório do posto ${prefixo} — indisponível: ${tooltip}`
          : `Exportar relatório do posto ${prefixo}`
      }
      aria-disabled={bloqueado}
      className="inline-flex items-center gap-1.5 rounded border border-gov-azul bg-white px-3 py-1.5 text-xs font-medium text-gov-azul hover:bg-gov-azul hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul disabled:cursor-not-allowed disabled:border-app-border disabled:bg-app-surface-2 disabled:text-app-fg-muted disabled:hover:bg-app-surface-2 disabled:hover:text-app-fg-muted"
    >
      {exportando ? 'Preparando…' : 'Exportar relatório'}
    </button>
  );
}
