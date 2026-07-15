import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { estoqueLocaisRepository } from '@/infrastructure/repositories';
import { exigirAdmin } from '@/app/api/_helpers/auth';
import { respostaDeErro } from '@/app/api/_helpers/erros';
import { logger } from '@/infrastructure/logging/logger';
import { checarRateLimit } from '../../_rl';
import { localPatchSchema, motivosZod } from '../../_schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const idSchema = z.string().uuid('Identificador de local inválido.');

/** PATCH /api/estoque/locais/[id] — edita local. Escrita: exigirAdmin. */
export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await exigirAdmin();
  if (auth instanceof NextResponse) return auth;
  const { headers, resposta } = checarRateLimit('movimentacaoEstoque', auth.id);
  if (resposta) return resposta;

  const idParsed = idSchema.safeParse((await ctx.params).id);
  if (!idParsed.success) return NextResponse.json({ erro: 'id_invalido' }, { status: 400, headers });

  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ erro: 'json_invalido' }, { status: 400, headers });
  }
  const parsed = localPatchSchema.safeParse(corpo);
  if (!parsed.success) {
    return NextResponse.json(
      { erro: 'body_invalido', motivos: motivosZod(parsed.error) },
      { status: 400, headers },
    );
  }

  try {
    const local = await estoqueLocaisRepository.atualizar(idParsed.data, parsed.data);
    logger.info(
      'estoque.locais.atualizado',
      { usuarioId: auth.id, localId: local.id },
      'Local de estoque atualizado',
    );
    return NextResponse.json(local, { status: 200, headers });
  } catch (e) {
    return respostaDeErro('PATCH /api/estoque/locais/[id]', { usuarioId: auth.id }, e);
  }
}

/** DELETE /api/estoque/locais/[id] — exclui SO se sem uso (senao 409). Admin. */
export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await exigirAdmin();
  if (auth instanceof NextResponse) return auth;
  const { headers, resposta } = checarRateLimit('movimentacaoEstoque', auth.id);
  if (resposta) return resposta;

  const idParsed = idSchema.safeParse((await ctx.params).id);
  if (!idParsed.success) return NextResponse.json({ erro: 'id_invalido' }, { status: 400, headers });

  try {
    await estoqueLocaisRepository.remover(idParsed.data);
    logger.info(
      'estoque.locais.removido',
      { usuarioId: auth.id, localId: idParsed.data },
      'Local de estoque removido',
    );
    return NextResponse.json({ id: idParsed.data, removido: true }, { status: 200, headers });
  } catch (e) {
    return respostaDeErro('DELETE /api/estoque/locais/[id]', { usuarioId: auth.id }, e);
  }
}
