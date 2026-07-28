import { notFound } from 'next/navigation';
import { EditorDiagrama } from '@/components/features/diagramas/editor/EditorDiagrama';
import type { Diagrama } from '@/domain/diagramas/diagrama';

/**
 * ROTA TEMPORÁRIA DE PREVIEW (dev-only) — NÃO COMMITAR.
 * Criada pela Fernanda para validar visualmente o modo ao vivo "AGORA" do
 * editor de diagramas, sem depender de auth (usa o bypass dev). Em produção
 * retorna 404.
 */
export const dynamic = 'force-dynamic';

const diagramaMock: Diagrama = {
  id: '00000000-0000-4000-8000-000000000000',
  nome: 'teste',
  bacia: 'Bacia do Alto Tietê',
  descricao: 'Diagrama de preview',
  elementos: [],
  criadoPor: null,
  criadoEm: new Date(),
  atualizadoEm: new Date(),
};

export default function PreviewDiagramaPage() {
  if (process.env.NODE_ENV !== 'development') {
    notFound();
  }

  return (
    <div className="lg:flex">
      <aside className="hidden border-r border-app-border-subtle bg-app-surface lg:block lg:h-screen lg:w-sidenav lg:shrink-0">
        <div className="flex h-header items-center border-b border-app-border-subtle px-3 text-xs font-semibold text-app-fg">
          SP ÁGUAS (preview)
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="h-header border-b border-app-border-subtle bg-app-surface" />
        <main className="mx-auto w-full max-w-content flex-1 px-4 py-6">
          <div className="space-y-6">
            <EditorDiagrama diagrama={diagramaMock} />
          </div>
        </main>
      </div>
    </div>
  );
}
