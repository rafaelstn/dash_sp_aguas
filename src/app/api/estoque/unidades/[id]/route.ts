import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  estoqueUnidadesRepository,
  estoqueMovimentacoesRepository,
} from '@/infrastructure/repositories';
import { exigirUsuario, exigirAdmin } from '@/app/api/_helpers/auth';
import { respostaDeErro } from '@/app/api/_helpers/erros';
import { UnidadeComMovimentacao, UnidadeNaoEncontrada } from '@/domain/errors';
import { logger } from '@/infrastructure/logging/logger';
import { checarRateLimit } from '../../_rl';
import { unidadePatchSchema, motivosZod } from '../../_schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const idSchema = z.string().uuid('Identificador de unidade inválido.');

/** GET /api/estoque/unidades/[id] — detalhe + historico de movimentacao. */
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await exigirUsuario();
  if (auth instanceof NextResponse) return auth;
  const { headers, resposta } = checarRateLimit('leituraEstoque', auth.id);
  if (resposta) return resposta;

  const idParsed = idSchema.safeParse((await ctx.params).id);
  if (!idParsed.success) return NextResponse.json({ erro: 'id_invalido' }, { status: 400, headers });

  try {
    const unidade = await estoqueUnidadesRepository.obterPorId(idParsed.data);
    if (!unidade) throw new UnidadeNaoEncontrada(idParsed.data);
    const historico = await estoqueMovimentacoesRepository.listar({
      unidadeId: idParsed.data,
      porPagina: 100,
    });
    return NextResponse.json({ unidade, historico: historico.itens }, { status: 200, headers });
  } catch (e) {
    return respostaDeErro('GET /api/estoque/unidades/[id]', { usuarioId: auth.id }, e);
  }
}

/** PATCH /api/estoque/unidades/[id] — edita atributos. Escrita: exigirAdmin. */
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
  const parsed = unidadePatchSchema.safeParse(corpo);
  if (!parsed.success) {
    return NextResponse.json(
      { erro: 'body_invalido', motivos: motivosZod(parsed.error) },
      { status: 400, headers },
    );
  }

  try {
    const unidade = await estoqueUnidadesRepository.atualizar(idParsed.data, parsed.data);
    logger.info(
      'estoque.unidades.atualizada',
      { usuarioId: auth.id, unidadeId: unidade.id },
      'Unidade serializada atualizada',
    );
    return NextResponse.json(unidade, { status: 200, headers });
  } catch (e) {
    return respostaDeErro('PATCH /api/estoque/unidades/[id]', { usuarioId: auth.id }, e);
  }
}

/**
 * DELETE /api/estoque/unidades/[id] — exclui SO se nao houver movimentacao;
 * caso contrario oriente usar `baixa` (409 unidade_com_movimentacao). Admin.
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
    const existente = await estoqueUnidadesRepository.obterPorId(id);
    if (!existente) throw new UnidadeNaoEncontrada(id);
    if (await estoqueUnidadesRepository.possuiMovimentacao(id)) {
      throw new UnidadeComMovimentacao(id);
    }
    await estoqueUnidadesRepository.remover(id);
    logger.info(
      'estoque.unidades.removida',
      { usuarioId: auth.id, unidadeId: id },
      'Unidade serializada removida (sem movimentacao)',
    );
    return NextResponse.json({ id, removido: true }, { status: 200, headers });
  } catch (e) {
    return respostaDeErro('DELETE /api/estoque/unidades/[id]', { usuarioId: auth.id }, e);
  }
}
