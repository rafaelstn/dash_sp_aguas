import type { ReactNode } from 'react';

/**
 * Lista de definicao (dl/dt/dd) para os detalhes de um item. Semantica correta
 * para leitor de tela (e-MAG / WCAG 1.3.1): rotulo e valor associados.
 */
export function ListaDetalhe({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">{children}</dl>;
}

export function CampoDetalhe({
  rotulo,
  children,
  largo,
}: {
  rotulo: string;
  children: ReactNode;
  largo?: boolean;
}) {
  return (
    <div className={largo ? 'sm:col-span-2' : undefined}>
      <dt className="text-2xs font-semibold uppercase tracking-wide text-app-fg-muted">
        {rotulo}
      </dt>
      <dd className="mt-0.5 break-words text-sm text-app-fg">{children}</dd>
    </div>
  );
}

/** Valor de texto com fallback para vazio. */
export function Valor({ texto }: { texto: string | null | undefined }) {
  return texto ? <>{texto}</> : <span className="text-app-fg-subtle">—</span>;
}
