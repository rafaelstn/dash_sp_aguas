import { HeaderMobile } from '@/components/mobile/HeaderMobile';

/**
 * Loading skeleton do detalhe do posto. Renderizado enquanto o Server
 * Component principal busca o posto via repository.
 */
export default function PostoDetalheLoading() {
  return (
    <>
      <HeaderMobile titulo="Carregando posto…" voltarHref="/app/postos" />
      <div
        className="px-safe pb-safe-nav mx-auto w-full max-w-content space-y-4 py-5"
        role="status"
        aria-live="polite"
        aria-label="Carregando dados do posto"
      >
        <div className="h-32 animate-pulse rounded-gov-card border border-app-border-subtle bg-app-surface-2" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-gov-card border border-app-border-subtle bg-app-surface-2"
            />
          ))}
        </div>
        <span className="sr-only">Carregando…</span>
      </div>
    </>
  );
}
