import { NextResponse } from 'next/server';
import {
  favoritosRepository,
  postosRepository,
} from '@/infrastructure/repositories';
import { listarFavoritos } from '@/application/use-cases/listar-favoritos';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';

export const dynamic = 'force-dynamic';

/** Lista favoritos do usuário autenticado + dados completos do posto. */
export async function GET() {
  const usuario = await obterUsuarioAtual();
  if (!usuario) {
    return NextResponse.json({ erro: 'nao_autenticado' }, { status: 401 });
  }
  try {
    const itens = await listarFavoritos(
      favoritosRepository,
      postosRepository,
      usuario.id,
    );
    return NextResponse.json({ total: itens.length, itens });
  } catch {
    return NextResponse.json(
      { erro: 'falha_listar_favoritos' },
      { status: 500 },
    );
  }
}
