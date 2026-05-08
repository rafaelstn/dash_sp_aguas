import { HeaderMobile } from '@/components/mobile/HeaderMobile';

/**
 * Lista de submissões do técnico (US-MOB-006) — placeholder Sprint 3+.
 *
 * Quando Lucas tiver o endpoint `/api/triagem/minhas-fichas` (Sprint 1
 * backend de triagem), Fernanda popula esta tela. Por enquanto, exibe
 * estado vazio + nota explicativa.
 */
export default function MinhasFichasPage() {
  return (
    <>
      <HeaderMobile titulo="Minhas fichas" />
      <div className="mx-auto w-full max-w-content px-4 py-5">
        <section
          aria-labelledby="minhas-fichas-titulo"
          className="rounded-gov-card border border-app-border-subtle bg-app-surface p-6 text-center"
        >
          <h2
            id="minhas-fichas-titulo"
            className="text-md font-semibold text-app-fg"
          >
            Você ainda não enviou fichas pelo aplicativo.
          </h2>
          <p className="mt-2 text-sm text-app-fg-muted">
            Quando você submeter uma ficha, ela aparece aqui com o status da
            triagem.
          </p>
        </section>

        <div
          role="status"
          className="mt-4 rounded-gov-card border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900"
        >
          <p className="font-semibold">Aguardando integração (Sprint 1/3).</p>
          <p className="mt-1">
            A listagem real será implementada quando o endpoint{' '}
            <code className="font-mono">/api/triagem/minhas-fichas</code>{' '}
            estiver disponível (responsabilidade Lucas).
          </p>
        </div>
      </div>
    </>
  );
}
