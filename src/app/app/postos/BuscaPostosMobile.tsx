'use client';

import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import type { Posto } from '@/domain/posto';
import type { RespostaBusca } from '@/types/dto';

const DEBOUNCE_MS = 300;
const MIN_CHARS = 3;

interface BuscaPostosMobileProps {
  /** Código do tipo de ficha (1..7) ou null se não passado. */
  tipo: number | null;
}

type Estado =
  | { kind: 'idle' }
  | { kind: 'curto' }
  | { kind: 'carregando' }
  | { kind: 'ok'; itens: Posto[]; total: number }
  | { kind: 'vazio' }
  | { kind: 'offline' }
  | { kind: 'erro'; mensagem: string };

/**
 * Search de posto mobile-first. Reusa o endpoint `/api/postos/search`.
 * Debounce 300ms, mínimo 3 caracteres (igual padrão US-MOB-003).
 *
 * Estados cobertos (regra `padrao.md` §Features): idle, carregando, vazio,
 * resultados, erro de rede (offline), erro 500.
 */
export function BuscaPostosMobile({ tipo }: BuscaPostosMobileProps) {
  const [termo, setTermo] = useState('');
  const [estado, setEstado] = useState<Estado>({ kind: 'idle' });
  const inputId = useId();

  useEffect(() => {
    const t = termo.trim();
    if (t.length === 0) {
      setEstado({ kind: 'idle' });
      return;
    }
    if (t.length < MIN_CHARS) {
      setEstado({ kind: 'curto' });
      return;
    }

    setEstado({ kind: 'carregando' });
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/postos/search?q=${encodeURIComponent(t)}&porPagina=20`,
          {
            signal: controller.signal,
            headers: { Accept: 'application/json' },
          },
        );
        if (!res.ok) {
          setEstado({
            kind: 'erro',
            mensagem: `Falha na busca (HTTP ${res.status})`,
          });
          return;
        }
        const dados = (await res.json()) as RespostaBusca;
        if (dados.itens.length === 0) {
          setEstado({ kind: 'vazio' });
        } else {
          setEstado({ kind: 'ok', itens: dados.itens, total: dados.total });
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        const offline = !navigator.onLine;
        setEstado(
          offline
            ? { kind: 'offline' }
            : {
                kind: 'erro',
                mensagem: err instanceof Error ? err.message : 'Erro desconhecido',
              },
        );
      }
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [termo]);

  return (
    <section aria-labelledby="busca-postos-titulo" className="space-y-3">
      <h2 id="busca-postos-titulo" className="sr-only">
        Buscar posto
      </h2>

      <div>
        <label
          htmlFor={inputId}
          className="block text-xs font-medium text-app-fg"
        >
          Prefixo, nome ou município
        </label>
        <input
          id={inputId}
          type="search"
          inputMode="search"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Ex.: 4D-001 ou Itu"
          className="mt-1 block w-full min-h-[44px] rounded border border-app-border bg-app-surface px-3 text-md text-app-fg placeholder:text-app-fg-muted focus:border-gov-azul focus:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul"
          aria-describedby={`${inputId}-ajuda`}
        />
        <p id={`${inputId}-ajuda`} className="mt-1 text-2xs text-app-fg-muted">
          Mínimo {MIN_CHARS} caracteres.
        </p>
      </div>

      <ResultadosBusca estado={estado} tipo={tipo} />
    </section>
  );
}

function ResultadosBusca({
  estado,
  tipo,
}: {
  estado: Estado;
  tipo: number | null;
}) {
  if (estado.kind === 'idle') {
    return (
      <p className="text-sm text-app-fg-muted">
        Digite acima para buscar um posto da rede.
      </p>
    );
  }
  if (estado.kind === 'curto') {
    return (
      <p className="text-sm text-app-fg-muted">
        Digite pelo menos {MIN_CHARS} caracteres.
      </p>
    );
  }
  if (estado.kind === 'carregando') {
    return (
      <p
        role="status"
        aria-live="polite"
        className="text-sm text-app-fg-muted"
      >
        Buscando…
      </p>
    );
  }
  if (estado.kind === 'offline') {
    return (
      <div
        role="alert"
        className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
      >
        Sem conexão. A busca de posto requer internet.
      </div>
    );
  }
  if (estado.kind === 'erro') {
    return (
      <div
        role="alert"
        className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900"
      >
        {estado.mensagem}
      </div>
    );
  }
  if (estado.kind === 'vazio') {
    return (
      <p className="rounded border border-app-border-subtle bg-app-surface p-3 text-sm text-app-fg-muted">
        Nenhum posto encontrado. Verifique o prefixo ou contate o gestor —
        cadastro de posto não é feito pelo aplicativo.
      </p>
    );
  }

  return (
    <div>
      <p className="mb-2 text-2xs uppercase tracking-wider text-app-fg-muted">
        {estado.total} posto{estado.total === 1 ? '' : 's'} encontrado
        {estado.total === 1 ? '' : 's'}
      </p>
      <ul className="space-y-2" aria-label="Resultados da busca de postos">
        {estado.itens.map((posto) => (
          <li key={posto.prefixo}>
            <CardResultadoPosto posto={posto} tipo={tipo} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function CardResultadoPosto({
  posto,
  tipo,
}: {
  posto: Posto;
  tipo: number | null;
}) {
  const href = tipo
    ? `/app/postos/${encodeURIComponent(posto.prefixo)}/fichas/nova/${tipo}`
    : `/app/postos/${encodeURIComponent(posto.prefixo)}`;

  return (
    <Link
      href={href}
      className="flex min-h-[64px] items-center gap-3 rounded-gov-card border border-app-border bg-app-surface p-3 hover:border-gov-azul focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul focus-visible:ring-offset-1"
    >
      <div
        className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded bg-gov-azul-claro font-mono text-xs font-bold text-gov-azul-escuro"
        aria-hidden="true"
      >
        {posto.prefixo.slice(0, 6)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-app-fg">
          {posto.nomeEstacao ?? posto.prefixo}
        </p>
        <p className="truncate text-xs text-app-fg-muted">
          {posto.municipio ?? '—'}
        </p>
      </div>
    </Link>
  );
}
