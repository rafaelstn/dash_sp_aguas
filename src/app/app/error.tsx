'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/**
 * Error boundary do app móvel (`/app/*`). Captura erros das telas do agente
 * em campo (home, postos, minhas fichas, formulário) sem cair no
 * `global-error`, que tem visual quebrado em mobile. Desenhado mobile-first.
 */
export default function ErroApp({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[app error.tsx]', error);
  }, [error]);

  return (
    <div
      role="alert"
      aria-labelledby="titulo-erro-app"
      className="px-safe pb-safe-nav mx-auto flex min-h-[60vh] w-full max-w-content flex-col items-center justify-center py-10 text-center"
    >
      <p className="text-2xs font-semibold uppercase tracking-wider text-gov-perigo">
        Erro inesperado
      </p>
      <h1 id="titulo-erro-app" className="mt-1 text-lg font-semibold text-gov-perigo">
        Não foi possível carregar
      </h1>
      <p className="mt-2 max-w-prose text-sm text-app-fg-muted">
        Verifique sua conexão e tente novamente. Se o problema persistir, informe o
        código abaixo ao administrador do sistema.
      </p>
      {error.digest ? (
        <p className="mono mt-3 rounded bg-app-surface-2 px-2 py-1 text-xs">
          {error.digest}
        </p>
      ) : null}
      <div className="mt-5 flex w-full max-w-xs flex-col gap-2">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded bg-gov-azul px-4 py-2.5 text-sm font-medium text-white hover:bg-gov-azul-escuro"
        >
          Tentar novamente
        </button>
        <Link
          href="/app"
          className="rounded border border-gov-borda bg-app-surface px-4 py-2.5 text-sm font-medium text-gov-texto"
        >
          Voltar ao início
        </Link>
      </div>
    </div>
  );
}
