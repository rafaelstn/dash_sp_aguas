import { NextResponse } from 'next/server';
import {
  anaRevisaoRepository,
  papeisRepository,
} from '@/infrastructure/repositories';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/inventario-ana/[codigo]
 * Detalhe de uma estação ANA no lote atual.
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ codigo: string }> },
) {
  const usuario = await obterUsuarioAtual();
  if (!usuario) {
    return NextResponse.json({ erro: 'nao_autenticado' }, { status: 401 });
  }
  const ehAprovador = await papeisRepository.ehAprovador(usuario.id);
  if (!ehAprovador) {
    return NextResponse.json({ erro: 'sem_papel_aprovador' }, { status: 403 });
  }

  const lote = await anaRevisaoRepository.loteAtual();
  if (!lote) {
    return NextResponse.json({ erro: 'sem_lote' }, { status: 404 });
  }

  const { codigo } = await ctx.params;
  const estacao = await anaRevisaoRepository.obterPorCodigo(lote.id, codigo);
  if (!estacao) {
    return NextResponse.json({ erro: 'nao_encontrada' }, { status: 404 });
  }

  return NextResponse.json({ estacao });
}
