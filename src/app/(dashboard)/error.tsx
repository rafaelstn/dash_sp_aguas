'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/**
 * Error boundary do route group `(dashboard)`. Captura erros das páginas
 * autenticadas (busca, painel, ficha do posto, fichas digitais, favoritos,
 * desconformidades) preservando o chrome (sidenav + header + footer) do
 * `(dashboard)/layout.tsx`.
 *
 * Erro de Server Component dentro deste segmento é capturado aqui,
 * evitando o fallback opaco do `global-error`.
 */
export default function ErroDashboard({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[dashboard error.tsx]', error);
  }, [error]);

  return (
    <section
      role="alert"
      aria-labelledby="titulo-erro-dashboard"
      className="rounded-gov-card border border-gov-perigo/30 bg-red-50 p-5 text-gov-perigo"
    >
      <p className="text-2xs font-semibold uppercase tracking-wider">
        Erro inesperado
      </p>
      <h2
        id="titulo-erro-dashboard"
        className="mt-1 text-lg font-semibold text-gov-perigo"
      >
        Não foi possível carregar esta seção
      </h2>
      <p className="mt-2 max-w-prose text-sm">
        Tente recarregar em instantes. Se o problema persistir, informe o
        código abaixo ao administrador do sistema.
      </p>
      {error.digest ? (
        <p className="mono mt-3 inline-block rounded bg-white/60 px-2 py-1 text-xs">
          {error.digest}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded bg-gov-azul px-3 py-1.5 text-xs font-medium text-white hover:bg-gov-azul-escuro"
        >
          Tentar novamente
        </button>
        <Link
          href="/"
          className="rounded border border-gov-borda bg-white px-3 py-1.5 text-xs font-medium text-gov-texto hover:bg-app-surface-2"
        >
          Voltar à página inicial
        </Link>
      </div>
    </section>
  );
}
