/**
 * Loading skeleton padrão do app móvel (`/app/*`), renderizado pelo Next
 * enquanto os Server Components da rota aguardam dados. Telas com loading
 * próprio (ex.: `minhas-fichas/loading.tsx`) sobrescrevem este.
 */
export default function AppLoading() {
  return (
    <div
      className="px-safe pb-safe-nav mx-auto w-full max-w-content py-5"
      role="status"
      aria-live="polite"
      aria-label="Carregando"
    >
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-gov-card border border-app-border-subtle bg-app-surface-2"
          />
        ))}
      </div>
      <span className="sr-only">Carregando…</span>
    </div>
  );
}
