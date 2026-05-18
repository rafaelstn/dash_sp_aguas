/**
 * Skeleton compartilhado para todas as rotas do route group `(dashboard)`
 * durante navegação client-side. Sem este arquivo, a transição entre
 * rotas mostra branco até o Server Component resolver.
 *
 * Mantido genérico: header + 5 linhas. Cada rota pode sobrescrever
 * com `loading.tsx` próprio se quiser skeleton fiel ao conteúdo.
 */
export default function DashboardLoading() {
  return (
    <div className="animate-pulse space-y-6" aria-hidden="true">
      <div className="space-y-2">
        <div className="h-6 w-1/3 rounded bg-app-surface-2" />
        <div className="h-3 w-1/2 rounded bg-app-surface-2" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-10 rounded bg-app-surface-2" />
        ))}
      </div>
    </div>
  );
}
