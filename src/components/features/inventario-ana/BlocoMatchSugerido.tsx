'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface Props {
  codigoAna: string;
  postoPrefixo: string;
  postoNome: string | null;
  postoMunicipio: string | null;
  confianca: 'alta' | 'media' | 'baixa';
  score: number;
}

const CORES: Record<Props['confianca'], string> = {
  alta: 'border-green-600 bg-green-50',
  media: 'border-amber-400 bg-amber-50',
  baixa: 'border-gray-400 bg-gray-50',
};

export function BlocoMatchSugerido({
  codigoAna,
  postoPrefixo,
  postoNome,
  postoMunicipio,
  confianca,
  score,
}: Props) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function aceitar() {
    if (
      !confirm(
        `Vincular estação ANA ${codigoAna} ao posto ${postoPrefixo} (${postoNome ?? ''})? Isto preenche postos.prefixo_ana e marca a estação como revisada.`,
      )
    ) {
      return;
    }
    setEnviando(true);
    setErro(null);
    try {
      const resp = await fetch(
        `/api/inventario-ana/${encodeURIComponent(codigoAna)}/aceitar-match`,
        { method: 'POST', credentials: 'same-origin' },
      );
      if (!resp.ok) {
        const b = (await resp.json().catch(() => ({}))) as {
          mensagem?: string;
          erro?: string;
        };
        throw new Error(b.mensagem ?? b.erro ?? `HTTP ${resp.status}`);
      }
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha.');
      setEnviando(false);
    }
  }

  return (
    <section
      aria-labelledby="sec-match"
      className={`rounded-gov-card border-l-4 p-4 ${CORES[confianca]}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="sec-match" className="text-sm font-semibold text-app-fg">
          Match sugerido com posto SP
        </h2>
        <span className="text-2xs uppercase tracking-wide text-app-fg-muted">
          Confiança: <strong className="text-app-fg">{confianca}</strong>{' '}
          <span className="mono">({(score * 100).toFixed(0)}%)</span>
        </span>
      </div>
      <p className="mt-1 text-sm text-app-fg">
        <Link
          href={`/postos/${encodeURIComponent(postoPrefixo)}`}
          className="mono text-gov-azul hover:underline"
        >
          {postoPrefixo}
        </Link>{' '}
        — {postoNome ?? '(sem nome)'}
        {postoMunicipio ? (
          <span className="text-app-fg-muted"> · {postoMunicipio}</span>
        ) : null}
      </p>
      {erro ? (
        <p
          role="alert"
          className="mt-2 rounded border-l-4 border-gov-perigo bg-red-50 p-2 text-sm text-gov-perigo"
        >
          {erro}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={aceitar}
          disabled={enviando}
          className="rounded bg-green-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
        >
          {enviando ? 'Aplicando…' : 'Aceitar match'}
        </button>
        <Link
          href={`/postos/${encodeURIComponent(postoPrefixo)}/editar`}
          className="rounded border border-gov-azul bg-white px-3 py-1.5 text-sm font-medium text-gov-azul hover:bg-app-surface-2"
        >
          Abrir posto sugerido
        </Link>
      </div>
    </section>
  );
}
