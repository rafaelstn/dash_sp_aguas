'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Posto } from '@/domain/posto';
import type { RespostaBusca } from '@/types/dto';

const DEBOUNCE_MS = 300;
const MIN_CHARS = 3;
const HIST_KEY = 'spaguas:postos:historico';
const HIST_LIMITE = 5;

interface BuscaPostosMobileProps {
  /** Código do tipo de ficha (1..7) ou null se não passado. */
  tipo: number | null;
  /** ID do usuário autenticado — usado para isolar histórico por conta. */
  usuarioId: string;
}

interface ItemHistorico {
  prefixo: string;
  nome: string | null;
  municipio: string | null;
  acessadoEm: number;
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
 * Debounce 300ms, mínimo 3 caracteres (US-MOB-003).
 *
 * Estados cobertos (regra `padrao.md` §Features): idle, carregando, vazio,
 * resultados, erro de rede (offline), erro 500.
 *
 * Sprint 3 — Fernanda endureceu com histórico recente em localStorage por
 * usuário (5 últimos postos). Aparece quando o termo está vazio. Click em
 * resultado registra acesso antes de navegar.
 */
export function BuscaPostosMobile({ tipo, usuarioId }: BuscaPostosMobileProps) {
  const [termo, setTermo] = useState('');
  const [estado, setEstado] = useState<Estado>({ kind: 'idle' });
  const [historico, setHistorico] = useState<ItemHistorico[]>([]);
  const inputId = useId();

  const chaveHist = useMemo(() => `${HIST_KEY}:${usuarioId}`, [usuarioId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const bruto = window.localStorage.getItem(chaveHist);
      if (!bruto) return;
      const parsed = JSON.parse(bruto) as ItemHistorico[];
      if (Array.isArray(parsed)) {
        setHistorico(
          parsed
            .filter(
              (i): i is ItemHistorico =>
                typeof i?.prefixo === 'string' &&
                typeof i?.acessadoEm === 'number',
            )
            .slice(0, HIST_LIMITE),
        );
      }
    } catch {
      /* localStorage indisponível ou JSON inválido */
    }
  }, [chaveHist]);

  function registrarAcesso(posto: {
    prefixo: string;
    nomeEstacao?: string | null;
    municipio?: string | null;
  }) {
    if (typeof window === 'undefined') return;
    const item: ItemHistorico = {
      prefixo: posto.prefixo,
      nome: posto.nomeEstacao ?? null,
      municipio: posto.municipio ?? null,
      acessadoEm: Date.now(),
    };
    const novo = [
      item,
      ...historico.filter((h) => h.prefixo !== item.prefixo),
    ].slice(0, HIST_LIMITE);
    setHistorico(novo);
    try {
      window.localStorage.setItem(chaveHist, JSON.stringify(novo));
    } catch {
      /* ignore */
    }
  }

  function limparHistorico() {
    setHistorico([]);
    try {
      window.localStorage.removeItem(chaveHist);
    } catch {
      /* ignore */
    }
  }

  const exibirHistorico = termo.trim().length === 0 && historico.length > 0;

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
          placeholder="Exemplo: 4D-001 ou Itu"
          className="mt-1 block w-full min-h-[44px] rounded border border-app-border bg-app-surface px-3 text-md text-app-fg placeholder:text-app-fg-muted focus:border-gov-azul focus:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul"
          aria-describedby={`${inputId}-ajuda`}
        />
        <p id={`${inputId}-ajuda`} className="mt-1 text-2xs text-app-fg-muted">
          Mínimo {MIN_CHARS} caracteres.
        </p>
      </div>

      {exibirHistorico ? (
        <HistoricoRecente
          itens={historico}
          tipo={tipo}
          onLimpar={limparHistorico}
          onAcessar={(prefixo) => {
            const item = historico.find((h) => h.prefixo === prefixo);
            if (!item) return;
            registrarAcesso({
              prefixo: item.prefixo,
              nomeEstacao: item.nome,
              municipio: item.municipio,
            });
          }}
        />
      ) : null}

      <ResultadosBusca
        estado={estado}
        tipo={tipo}
        onAcessar={registrarAcesso}
      />
    </section>
  );
}

function HistoricoRecente({
  itens,
  tipo,
  onLimpar,
  onAcessar,
}: {
  itens: ItemHistorico[];
  tipo: number | null;
  onLimpar: () => void;
  onAcessar: (prefixo: string) => void;
}) {
  return (
    <section
      aria-labelledby="hist-postos-titulo"
      className="rounded-gov-card border border-app-border-subtle bg-app-surface p-3"
    >
      <div className="flex items-center justify-between">
        <h3
          id="hist-postos-titulo"
          className="text-2xs font-semibold uppercase tracking-wider text-app-fg-muted"
        >
          Postos recentes
        </h3>
        <button
          type="button"
          onClick={onLimpar}
          className="min-h-[36px] rounded px-2 py-1 text-2xs font-medium text-app-fg-muted hover:bg-app-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul"
        >
          Limpar histórico
        </button>
      </div>
      <ul
        className="mt-2 space-y-2"
        aria-label="Postos consultados recentemente"
      >
        {itens.map((item) => (
          <li key={item.prefixo}>
            <Link
              href={
                tipo
                  ? `/app/postos/${encodeURIComponent(item.prefixo)}/fichas/nova/${tipo}`
                  : `/app/postos/${encodeURIComponent(item.prefixo)}`
              }
              onClick={() => onAcessar(item.prefixo)}
              className="flex min-h-[44px] items-center gap-3 rounded border border-app-border-subtle bg-app-surface p-2 hover:border-gov-azul focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul"
            >
              <div
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded bg-gov-azul-claro font-mono text-2xs font-bold text-gov-azul-escuro"
                aria-hidden="true"
              >
                {item.prefixo.slice(0, 6)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-app-fg">
                  {item.nome ?? item.prefixo}
                </p>
                <p className="truncate text-2xs text-app-fg-muted">
                  {item.municipio ?? '—'}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ResultadosBusca({
  estado,
  tipo,
  onAcessar,
}: {
  estado: Estado;
  tipo: number | null;
  onAcessar: (posto: Posto) => void;
}) {
  if (estado.kind === 'idle') {
    return (
      <p className="text-sm text-app-fg-muted">
        Informe prefixo, nome ou município do posto a localizar.
      </p>
    );
  }
  if (estado.kind === 'curto') {
    return (
      <p className="text-sm text-app-fg-muted">
        Informe ao menos {MIN_CHARS} caracteres para iniciar a busca.
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
        Consultando postos…
      </p>
    );
  }
  if (estado.kind === 'offline') {
    return (
      <div
        role="alert"
        className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
      >
        Sem conexão no momento. A consulta de postos requer acesso à rede.
      </div>
    );
  }
  if (estado.kind === 'erro') {
    return (
      <div
        role="alert"
        className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900"
      >
        Não foi possível concluir a consulta. Tente novamente em instantes.
        {estado.mensagem ? (
          <span className="mt-1 block text-2xs text-red-800">
            Detalhe técnico: {estado.mensagem}
          </span>
        ) : null}
      </div>
    );
  }
  if (estado.kind === 'vazio') {
    return (
      <p className="rounded border border-app-border-subtle bg-app-surface p-3 text-sm text-app-fg-muted">
        Nenhum posto localizado para os termos informados. Verifique o prefixo
        ou contate o gestor responsável. O cadastro de novos postos não é feito
        pelo aplicativo.
      </p>
    );
  }

  return (
    <div>
      <p className="mb-2 text-2xs uppercase tracking-wider text-app-fg-muted">
        {estado.total} posto{estado.total === 1 ? '' : 's'} localizado
        {estado.total === 1 ? '' : 's'}
      </p>
      <ul className="space-y-2" aria-label="Resultados da busca de postos">
        {estado.itens.map((posto) => (
          <li key={posto.prefixo}>
            <CardResultadoPosto
              posto={posto}
              tipo={tipo}
              onAcessar={onAcessar}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function CardResultadoPosto({
  posto,
  tipo,
  onAcessar,
}: {
  posto: Posto;
  tipo: number | null;
  onAcessar: (posto: Posto) => void;
}) {
  const href = tipo
    ? `/app/postos/${encodeURIComponent(posto.prefixo)}/fichas/nova/${tipo}`
    : `/app/postos/${encodeURIComponent(posto.prefixo)}`;

  return (
    <Link
      href={href}
      onClick={() => onAcessar(posto)}
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
