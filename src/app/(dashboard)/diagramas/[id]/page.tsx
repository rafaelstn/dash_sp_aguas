import { randomUUID } from 'node:crypto';
import { notFound, redirect } from 'next/navigation';
import { Alerta } from '@/components/ui/Alerta';
import { EditorDiagramaLazy } from '@/components/features/diagramas/editor/EditorDiagramaLazy';
import { diagramasRepository } from '@/infrastructure/repositories';
import { obterDiagrama } from '@/application/use-cases/diagramas';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import { logger } from '@/infrastructure/logging/logger';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Editor de diagrama — SP Águas - DMO',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Editor visual de diagrama (Fase A2). Server Component: carrega o diagrama
 * completo (com elementos) via use case e entrega ao editor client React Flow.
 * Estados cobertos: não autenticado (redirect), não encontrado (404), falha
 * (Alerta com código de correlação).
 */
export default async function EditorDiagramaPage({ params }: PageProps) {
  const { id } = await params;

  const usuario = await obterUsuarioAtual();
  if (!usuario) {
    redirect(`/login?returnTo=/diagramas/${id}`);
  }

  try {
    const diagrama = await obterDiagrama(diagramasRepository, id);
    if (!diagrama) {
      notFound();
    }
    return <EditorDiagramaLazy diagrama={diagrama} />;
  } catch (erro) {
    const codigo = randomUUID().slice(0, 8);
    logger.error(
      'diagramas.carregar.falha',
      {
        codigo,
        id,
        usuarioId: usuario.id,
        motivo: erro instanceof Error ? erro.message : String(erro),
      },
      'Falha ao carregar diagrama',
    );
    return (
      <div className="p-6">
        <Alerta
          tipo="erro"
          titulo="Não foi possível carregar o diagrama no momento"
        >
          Tente novamente em instantes. Se o problema persistir, informe o código{' '}
          <code className="font-mono font-semibold">{codigo}</code> à equipe
          técnica.
        </Alerta>
      </div>
    );
  }
}
