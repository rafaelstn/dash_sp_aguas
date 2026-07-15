import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { estoqueCategoriasRepository } from '@/infrastructure/repositories';
import { exigirAdmin } from '@/app/api/_helpers/auth';
import { respostaDeErro } from '@/app/api/_helpers/erros';
import { logger } from '@/infrastructure/logging/logger';
import { checarRateLimit } from '../../_rl';
import { categoriaSchema, motivosZod } from '../../_schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const idSchema = z.string().uuid('Identificador de categoria inválido.');

/** PATCH /api/estoque/categorias/[id] — edita. Escrita: exigirAdmin. */
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
  const parsed = categoriaSchema.safeParse(corpo);
  if (!parsed.success) {
    return NextResponse.json(
      { erro: 'body_invalido', motivos: motivosZod(parsed.error) },
      { status: 400, headers },
    );
  }

  try {
    const categoria = await estoqueCategoriasRepository.atualizar(idParsed.data, parsed.data);
    logger.info(
      'estoque.categorias.atualizada',
      { usuarioId: auth.id, categoriaId: categoria.id },
      'Categoria de estoque atualizada',
    );
    return NextResponse.json(categoria, { status: 200, headers });
  } catch (e) {
    return respostaDeErro('PATCH /api/estoque/categorias/[id]', { usuarioId: auth.id }, e);
  }
}

/** DELETE /api/estoque/categorias/[id] — remove (desvincula materiais). Admin. */
export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await exigirAdmin();
  if (auth instanceof NextResponse) return auth;
  const { headers, resposta } = checarRateLimit('movimentacaoEstoque', auth.id);
  if (resposta) return resposta;

  const idParsed = idSchema.safeParse((await ctx.params).id);
  if (!idParsed.success) return NextResponse.json({ erro: 'id_invalido' }, { status: 400, headers });

  try {
    await estoqueCategoriasRepository.remover(idParsed.data);
    logger.info(
      'estoque.categorias.removida',
      { usuarioId: auth.id, categoriaId: idParsed.data },
      'Categoria de estoque removida',
    );
    return NextResponse.json({ id: idParsed.data, removido: true }, { status: 200, headers });
  } catch (e) {
    return respostaDeErro('DELETE /api/estoque/categorias/[id]', { usuarioId: auth.id }, e);
  }
}
