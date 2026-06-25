import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { Alerta } from '@/components/ui/Alerta';
import { ListaDiagramas } from '@/components/features/diagramas/ListaDiagramas';
import { diagramasRepository } from '@/infrastructure/repositories';
import { listarDiagramas } from '@/application/use-cases/diagramas';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import { logger } from '@/infrastructure/logging/logger';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Diagramas unifilares — SP Águas - DMO',
};

export default async function PaginaDiagramas() {
  const usuario = await obterUsuarioAtual();
  if (!usuario) {
    redirect('/login?returnTo=/diagramas');
  }

  try {
    const diagramas = await listarDiagramas(diagramasRepository);
    return <ListaDiagramas diagramasIniciais={diagramas} />;
  } catch (erro) {
    const codigo = randomUUID().slice(0, 8);
    logger.error(
      'diagramas.listar.falha',
      {
        codigo,
        usuarioId: usuario.id,
        motivo: erro instanceof Error ? erro.message : String(erro),
      },
      'Falha ao listar diagramas',
    );
    return (
      <Alerta
        tipo="erro"
        titulo="Não foi possível carregar os diagramas no momento"
      >
        Tente novamente em instantes. Se o problema persistir, informe o código{' '}
        <code className="font-mono font-semibold">{codigo}</code> à equipe
        técnica.
      </Alerta>
    );
  }
}
