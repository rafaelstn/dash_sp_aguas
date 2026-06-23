import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { diagramasRepository } from '@/infrastructure/repositories';
import { exigirUsuario } from '@/app/api/_helpers/auth';
import { duplicarDiagrama } from '@/application/use-cases/diagramas';
import { DiagramaNaoEncontrado } from '@/domain/errors';
import { logger } from '@/infrastructure/logging/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const idSchema = z.string().uuid();

/** POST /api/diagramas/[id]/duplicar — cria uma cópia do diagrama. */
export async function POST(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await exigirUsuario();
  if (auth instanceof NextResponse) return auth;
  const usuario = auth;

  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ erro: 'id_invalido' }, { status: 400 });
  }

  try {
    const diagrama = await duplicarDiagrama(diagramasRepository, id, usuario.id);
    return NextResponse.json({ diagrama }, { status: 201 });
  } catch (e) {
    if (e instanceof DiagramaNaoEncontrado) {
      return NextResponse.json(
        { erro: 'nao_encontrado', mensagem: 'Diagrama não encontrado.' },
        { status: 404 },
      );
    }
    const correlationId = randomUUID();
    logger.error(
      'erro_inesperado',
      { correlationId, rota: 'POST /api/diagramas/[id]/duplicar', id, erro: String(e) },
      'Falha ao duplicar diagrama',
    );
    return NextResponse.json(
      { erro: 'falha_duplicacao', mensagem: 'Falha ao duplicar diagrama.', correlationId },
      { status: 500 },
    );
  }
}
