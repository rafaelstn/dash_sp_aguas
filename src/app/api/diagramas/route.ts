import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { diagramasRepository } from '@/infrastructure/repositories';
import { exigirUsuario } from '@/app/api/_helpers/auth';
import {
  criarDiagrama,
  listarDiagramas,
} from '@/application/use-cases/diagramas';
import { elementosSchema } from '@/domain/diagramas/schemas';
import { respostaDeErro } from '@/app/api/_helpers/erros';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const corpoCriarSchema = z.object({
  nome: z.string().trim().min(1).max(200),
  bacia: z.string().trim().max(120).nullable().optional(),
  descricao: z.string().trim().max(2000).nullable().optional(),
  elementos: elementosSchema.optional(),
});

/** GET /api/diagramas — lista resumida (sem elementos). */
export async function GET() {
  const auth = await exigirUsuario();
  if (auth instanceof NextResponse) return auth;

  try {
    const diagramas = await listarDiagramas(diagramasRepository);
    return NextResponse.json({ diagramas });
  } catch (e) {
    return respostaDeErro('GET /api/diagramas', {}, e);
  }
}

/** POST /api/diagramas — cria um diagrama. */
export async function POST(request: NextRequest) {
  const auth = await exigirUsuario();
  if (auth instanceof NextResponse) return auth;
  const usuario = auth;

  let bruto: unknown;
  try {
    bruto = await request.json();
  } catch {
    return NextResponse.json({ erro: 'json_invalido' }, { status: 400 });
  }
  const parsed = corpoCriarSchema.safeParse(bruto);
  if (!parsed.success) {
    return NextResponse.json(
      {
        erro: 'body_invalido',
        motivos: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      },
      { status: 400 },
    );
  }

  try {
    const diagrama = await criarDiagrama(
      diagramasRepository,
      parsed.data,
      usuario.id,
    );
    return NextResponse.json({ diagrama }, { status: 201 });
  } catch (e) {
    return respostaDeErro('POST /api/diagramas', { nome: parsed.data.nome }, e);
  }
}
