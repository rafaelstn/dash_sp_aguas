'use client';

import dynamic from 'next/dynamic';
import type { Diagrama } from '@/domain/diagramas/diagrama';

/**
 * Wrapper client que carrega o {@link EditorDiagrama} (React Flow / xyflow,
 * pesado) sob demanda e sem SSR. Mantém o bundle inicial da rota leve: o editor
 * só baixa no cliente quando a página monta.
 *
 * Existe porque a página de diagrama é Server Component e `ssr: false` não é
 * permitido em Server Component no Next 15 — o dynamic precisa morar num
 * client component.
 */
const EditorDiagramaDinamico = dynamic(
  () => import('./EditorDiagrama').then((m) => m.EditorDiagrama),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-screen items-center justify-center text-gray-500">
        Carregando editor…
      </div>
    ),
  },
);

export function EditorDiagramaLazy({ diagrama }: { diagrama: Diagrama }) {
  return <EditorDiagramaDinamico diagrama={diagrama} />;
}
