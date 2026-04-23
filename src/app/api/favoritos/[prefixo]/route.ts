import { NextResponse, type NextRequest } from 'next/server';
import { favoritosRepository } from '@/infrastructure/repositories';
import { alternarFavorito } from '@/application/use-cases/alternar-favorito';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';

export const dynamic = 'force-dynamic';

/**
 * Alterna o favorito do posto identificado por `prefixo`.
 * POST / DELETE ambos alternam — semântica idempotente escolhida
 * intencionalmente para simplificar a UI (um único endpoint que devolve
 * o estado resultante).
 */
async function handler(
  _request: NextRequest,
  ctx: { params: Promise<{ prefixo: string }> },
) {
  const usuario = await obterUsuarioAtual();
  if (!usuario) {
    return NextResponse.json({ erro: 'nao_autenticado' }, { status: 401 });
  }
  const { prefixo: prefixoRaw } = await ctx.params;
  const prefixo = decodeURIComponent(prefixoRaw).trim();
  if (!prefixo) {
    return NextResponse.json({ erro: 'prefixo_invalido' }, { status: 400 });
  }

  try {
    const { favoritado } = await alternarFavorito(favoritosRepository, {
      usuarioId: usuario.id,
      prefixo,
    });
    return NextResponse.json({ prefixo, favoritado });
  } catch {
    return NextResponse.json({ erro: 'falha_alternar' }, { status: 500 });
  }
}

export const POST = handler;
export const DELETE = handler;
