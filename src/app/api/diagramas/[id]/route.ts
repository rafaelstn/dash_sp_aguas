import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { diagramasRepository } from '@/infrastructure/repositories';
import { exigirUsuario, permitirDonoOuAprovador } from '@/app/api/_helpers/auth';
import {
  excluirDiagrama,
  obterDiagrama,
  renomearDiagrama,
  salvarElementosDiagrama,
} from '@/application/use-cases/diagramas';
import { elementosSchema } from '@/domain/diagramas/schemas';
import { respostaDeErro } from '@/app/api/_helpers/erros';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const idSchema = z.string().uuid();

// PATCH aceita exatamente uma das operações: renomear OU salvar elementos.
const patchSchema = z.union([
  z.object({ nome: z.string().trim().min(1).max(200) }).strict(),
  z.object({ elementos: elementosSchema }).strict(),
]);

/** GET /api/diagramas/[id] — diagrama completo (com elementos). */
export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await exigirUsuario();
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ erro: 'id_invalido' }, { status: 400 });
  }

  try {
    const diagrama = await obterDiagrama(diagramasRepository, id);
    if (!diagrama) {
      return NextResponse.json(
        { erro: 'nao_encontrado', mensagem: 'Diagrama não encontrado.' },
        { status: 404 },
      );
    }
    return NextResponse.json({ diagrama });
  } catch (e) {
    return respostaDeErro('GET /api/diagramas/[id]', { id }, e);
  }
}

/** PATCH /api/diagramas/[id] — renomeia (nome) ou salva elementos. */
export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await exigirUsuario();
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ erro: 'id_invalido' }, { status: 400 });
  }

  let bruto: unknown;
  try {
    bruto = await request.json();
  } catch {
    return NextResponse.json({ erro: 'json_invalido' }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(bruto);
  if (!parsed.success) {
    return NextResponse.json(
      {
        erro: 'body_invalido',
        motivos: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      },
      { status: 400 },
    );
  }

  // Autorização (SEG-1): só o autor do diagrama ou um aprovador pode alterar.
  const diagrama = await obterDiagrama(diagramasRepository, id);
  if (!diagrama) {
    return NextResponse.json(
      { erro: 'nao_encontrado', mensagem: 'Diagrama não encontrado.' },
      { status: 404 },
    );
  }
  const permissao = await permitirDonoOuAprovador(auth, diagrama.criadoPor);
  if (permissao instanceof NextResponse) return permissao;

  try {
    if ('nome' in parsed.data) {
      await renomearDiagrama(diagramasRepository, id, parsed.data.nome);
    } else {
      await salvarElementosDiagrama(diagramasRepository, id, parsed.data.elementos);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    // DiagramaNaoEncontrado -> 404 e o fallback 5xx são tratados centralmente.
    return respostaDeErro('PATCH /api/diagramas/[id]', { id }, e);
  }
}

/** DELETE /api/diagramas/[id] — exclui. */
export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await exigirUsuario();
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ erro: 'id_invalido' }, { status: 400 });
  }

  // Autorização (SEG-1): só o autor do diagrama ou um aprovador pode excluir.
  const diagrama = await obterDiagrama(diagramasRepository, id);
  if (!diagrama) {
    return NextResponse.json(
      { erro: 'nao_encontrado', mensagem: 'Diagrama não encontrado.' },
      { status: 404 },
    );
  }
  const permissao = await permitirDonoOuAprovador(auth, diagrama.criadoPor);
  if (permissao instanceof NextResponse) return permissao;

  try {
    await excluirDiagrama(diagramasRepository, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    // DiagramaNaoEncontrado -> 404 e o fallback 5xx são tratados centralmente.
    return respostaDeErro('DELETE /api/diagramas/[id]', { id }, e);
  }
}
