import { HeaderMobile } from '@/components/mobile/HeaderMobile';

/**
 * Loading skeleton da página `Minhas fichas`. Renderizado pelo Next
 * automaticamente enquanto o Server Component principal aguarda dados
 * do `triagemRepository`.
 */
export default function MinhasFichasLoading() {
  return (
    <>
      <HeaderMobile titulo="Minhas fichas" voltarHref="/app" />
      <div
        className="mx-auto w-full max-w-content px-4 py-5 pb-24"
        role="status"
        aria-live="polite"
        aria-label="Carregando fichas"
      >
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-gov-card border border-app-border-subtle bg-app-surface-2"
            />
          ))}
        </div>
        <span className="sr-only">Carregando…</span>
      </div>
    </>
  );
}
