import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { diagramasRepository } from '@/infrastructure/repositories';
import { exigirUsuario } from '@/app/api/_helpers/auth';
import { duplicarDiagrama } from '@/application/use-cases/diagramas';
import { respostaDeErro } from '@/app/api/_helpers/erros';

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
    // DiagramaNaoEncontrado -> 404 e o fallback 5xx são tratados centralmente.
    return respostaDeErro('POST /api/diagramas/[id]/duplicar', { id }, e);
  }
}
