'use client';

import { useState, useTransition } from 'react';
import { formatarDataHora } from '@/lib/format';

export type StatusIndexacao = 'ok' | 'stale' | 'ausente' | 'indexando';

export interface BadgeIndexacaoProps {
  prefixo: string;
  indexadoEm: Date | null;
  expiraEm: Date | null;
  status: StatusIndexacao;
  /** Callback opcional chamado após reindexação bem-sucedida. */
  onReindexado?: () => void;
}

/**
 * Badge acessível com estado de indexação do acervo do posto.
 * - role="status" + aria-live="polite" para anunciar mudanças em screen readers.
 * - Botão "reindexar agora" dispara POST /api/postos/{prefixo}/reindexar.
 * - Mostra tempo relativo ("há 2h") se recente, data absoluta se antigo.
 */
export function BadgeIndexacao({
  prefixo,
  indexadoEm,
  status,
  onReindexado,
}: BadgeIndexacaoProps) {
  const [erro, setErro] = useState<string | null>(null);
  const [iniciando, startTransition] = useTransition();

  const rotuloStatus = rotulosStatus[status];
  const legenda = legendaTempo(indexadoEm, status);

  async function reindexar() {
    setErro(null);
    startTransition(async () => {
      try {
        const resp = await fetch(
          `/api/postos/${encodeURIComponent(prefixo)}/reindexar`,
          { method: 'POST' },
        );
        if (!resp.ok) {
          throw new Error(`Falha na reindexação (HTTP ${resp.status})`);
        }
        onReindexado?.();
      } catch (e) {
        setErro(
          e instanceof Error
            ? 'Não foi possível iniciar a reindexação. Tente novamente em instantes.'
            : 'Erro desconhecido ao solicitar reindexação.',
        );
      }
    });
  }

  const desabilitarBotao = iniciando || status === 'indexando';

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="flex flex-wrap items-center gap-2 rounded-gov-card border border-app-border-subtle bg-app-surface-2 px-3 py-2 text-xs"
    >
      <span
        className={`inline-flex items-center gap-1.5 font-medium ${corTexto[status]}`}
      >
        <span
          aria-hidden="true"
          className={`inline-block h-2 w-2 rounded-full ${corPonto[status]}`}
        />
        {rotuloStatus}
      </span>

      {legenda ? (
        <span className="text-app-fg-muted">{legenda}</span>
      ) : null}

      <button
        type="button"
        onClick={reindexar}
        disabled={desabilitarBotao}
        aria-label={`Reindexar arquivos do posto ${prefixo} agora`}
        className="ml-auto rounded border border-gov-azul px-2 py-1 text-xs font-medium text-gov-azul hover:bg-gov-azul hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul disabled:cursor-not-allowed disabled:opacity-60"
      >
        {iniciando ? 'Solicitando…' : 'Reindexar agora'}
      </button>

      {erro ? (
        <p role="alert" className="w-full text-gov-perigo">
          {erro}
        </p>
      ) : null}
    </div>
  );
}

const rotulosStatus: Record<StatusIndexacao, string> = {
  ok: 'Acervo atualizado',
  stale: 'Acervo possivelmente desatualizado',
  ausente: 'Acervo ainda não indexado',
  indexando: 'Indexação em andamento',
};

const corTexto: Record<StatusIndexacao, string> = {
  ok: 'text-gov-sucesso',
  stale: 'text-gov-alerta',
  ausente: 'text-app-fg-muted',
  indexando: 'text-gov-azul',
};

const corPonto: Record<StatusIndexacao, string> = {
  ok: 'bg-gov-sucesso',
  stale: 'bg-gov-alerta',
  ausente: 'bg-app-fg-subtle',
  indexando: 'bg-gov-azul motion-safe:animate-pulse',
};

function legendaTempo(indexadoEm: Date | null, status: StatusIndexacao): string | null {
  if (status === 'indexando') return 'a varredura pode levar alguns segundos';
  if (status === 'ausente' || !indexadoEm) return null;

  const agora = Date.now();
  const diffMs = agora - indexadoEm.getTime();
  const diffHoras = diffMs / (1000 * 60 * 60);

  if (diffHoras < 1) {
    const diffMin = Math.max(1, Math.round(diffMs / (1000 * 60)));
    return `atualizado há ${diffMin} ${diffMin === 1 ? 'minuto' : 'minutos'}`;
  }
  if (diffHoras < 24) {
    const h = Math.round(diffHoras);
    return `atualizado há ${h} ${h === 1 ? 'hora' : 'horas'}`;
  }
  return `atualizado em ${formatarDataHora(indexadoEm)}`;
}
