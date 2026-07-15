import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { estoqueMateriaisRepository } from '@/infrastructure/repositories';
import { exigirUsuario, exigirAdmin } from '@/app/api/_helpers/auth';
import { respostaDeErro } from '@/app/api/_helpers/erros';
import { MaterialNaoEncontrado } from '@/domain/errors';
import { logger } from '@/infrastructure/logging/logger';
import { checarRateLimit } from '../../_rl';
import { materialPatchSchema, motivosZod } from '../../_schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const idSchema = z.string().uuid('Identificador de material inválido.');

/** GET /api/estoque/materiais/[id] — detalhe. Leitura: exigirUsuario. */
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await exigirUsuario();
  if (auth instanceof NextResponse) return auth;
  const { headers, resposta } = checarRateLimit('leituraEstoque', auth.id);
  if (resposta) return resposta;

  const idParsed = idSchema.safeParse((await ctx.params).id);
  if (!idParsed.success) return NextResponse.json({ erro: 'id_invalido' }, { status: 400, headers });

  try {
    const material = await estoqueMateriaisRepository.obterPorId(idParsed.data);
    if (!material) throw new MaterialNaoEncontrado(idParsed.data);
    return NextResponse.json(material, { status: 200, headers });
  } catch (e) {
    return respostaDeErro('GET /api/estoque/materiais/[id]', { usuarioId: auth.id }, e);
  }
}

/** PATCH /api/estoque/materiais/[id] — edita. Escrita: exigirAdmin. */
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
  const parsed = materialPatchSchema.safeParse(corpo);
  if (!parsed.success) {
    return NextResponse.json(
      { erro: 'body_invalido', motivos: motivosZod(parsed.error) },
      { status: 400, headers },
    );
  }

  try {
    const material = await estoqueMateriaisRepository.atualizar(idParsed.data, parsed.data);
    logger.info(
      'estoque.materiais.atualizado',
      { usuarioId: auth.id, materialId: material.id },
      'Material de estoque atualizado',
    );
    return NextResponse.json(material, { status: 200, headers });
  } catch (e) {
    return respostaDeErro('PATCH /api/estoque/materiais/[id]', { usuarioId: auth.id }, e);
  }
}

/**
 * DELETE /api/estoque/materiais/[id] — soft-inativa quando ha vinculo
 * (unidade/saldo/movimentacao); hard-delete so quando sem vinculo. Escrita: admin.
 */
export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await exigirAdmin();
  if (auth instanceof NextResponse) return auth;
  const { headers, resposta } = checarRateLimit('movimentacaoEstoque', auth.id);
  if (resposta) return resposta;

  const idParsed = idSchema.safeParse((await ctx.params).id);
  if (!idParsed.success) return NextResponse.json({ erro: 'id_invalido' }, { status: 400, headers });
  const id = idParsed.data;

  try {
    const existente = await estoqueMateriaisRepository.obterPorId(id);
    if (!existente) throw new MaterialNaoEncontrado(id);

    const temVinculos = await estoqueMateriaisRepository.possuiVinculos(id);
    if (temVinculos) {
      const inativado = await estoqueMateriaisRepository.inativar(id);
      logger.info(
        'estoque.materiais.inativado',
        { usuarioId: auth.id, materialId: id },
        'Material inativado (possuia vinculo; hard-delete bloqueado)',
      );
      return NextResponse.json({ id, inativado: true, removido: false, material: inativado }, { status: 200, headers });
    }

    await estoqueMateriaisRepository.remover(id);
    logger.info(
      'estoque.materiais.removido',
      { usuarioId: auth.id, materialId: id },
      'Material removido (sem vinculo)',
    );
    return NextResponse.json({ id, inativado: false, removido: true }, { status: 200, headers });
  } catch (e) {
    return respostaDeErro('DELETE /api/estoque/materiais/[id]', { usuarioId: auth.id }, e);
  }
}
