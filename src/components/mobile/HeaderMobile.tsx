import Link from 'next/link';

interface HeaderMobileProps {
  /** Título exibido no centro/esquerda. */
  titulo: string;
  /** Subtítulo opcional (ex.: nome do usuário, contexto). */
  subtitulo?: string;
  /** href do botão de voltar. Se omitido, não renderiza voltar. */
  voltarHref?: string;
  /** Slot de ação à direita (ex.: link "Sair"). */
  acaoDireita?: React.ReactNode;
}

const IconeVoltar = (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-5 w-5"
  >
    <path d="M15 18l-6-6 6-6" />
  </svg>
);

/**
 * Header superior fixo das rotas /app/*. Mantém alinhamento institucional
 * (governo) sem o chrome pesado do dashboard web.
 *
 * Server Component — sem estado.
 */
export function HeaderMobile({
  titulo,
  subtitulo,
  voltarHref,
  acaoDireita,
}: HeaderMobileProps) {
  return (
    <header
      className="sticky top-0 z-30 border-b border-app-border-subtle bg-app-surface/95 backdrop-blur supports-[backdrop-filter]:bg-app-surface/80"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0)',
        paddingLeft: 'env(safe-area-inset-left, 0)',
        paddingRight: 'env(safe-area-inset-right, 0)',
      }}
    >
      <div className="mx-auto flex h-14 max-w-content items-center gap-2 px-3">
        {voltarHref ? (
          <Link
            href={voltarHref}
            aria-label="Voltar"
            className="-ml-1 flex h-11 w-11 items-center justify-center rounded text-app-fg transition-colors hover:bg-app-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul active:bg-app-surface-3"
          >
            {IconeVoltar}
          </Link>
        ) : (
          <div className="h-11 w-11" aria-hidden="true" />
        )}

        <div className="min-w-0 flex-1">
          {subtitulo ? (
            <p className="truncate text-2xs uppercase tracking-wider text-app-fg-muted">
              {subtitulo}
            </p>
          ) : null}
          <h1 className="truncate text-md font-semibold leading-tight text-app-fg">
            {titulo}
          </h1>
        </div>

        {acaoDireita ? (
          <div className="flex items-center">{acaoDireita}</div>
        ) : null}
      </div>
    </header>
  );
}
