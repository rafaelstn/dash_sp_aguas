import { NextResponse, type NextRequest } from 'next/server';
import {
  papeisRepository,
  triagemRepository,
} from '@/infrastructure/repositories';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import { obterFichaTriagem } from '@/application/use-cases/triagem/listar-triagem-pendentes';
import {
  POLITICAS,
  aplicarHeadersRateLimit,
  consumirRateLimit,
} from '@/infrastructure/security/rate-limit';
import { respostaDeErro } from '@/app/api/_helpers/erros';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/triagem/[id]
 * Detalhe da ficha. Aprovador vê tudo; técnico só vê as próprias.
 * Sem ambos os critérios → 404 (evita oracle de IDs).
 */
export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const usuario = await obterUsuarioAtual();
  if (!usuario) {
    return NextResponse.json({ erro: 'nao_autenticado' }, { status: 401 });
  }

  const rl = consumirRateLimit(POLITICAS.leituraTriagem, usuario.id);
  const headers = new Headers();
  aplicarHeadersRateLimit(headers, POLITICAS.leituraTriagem, rl);
  if (!rl.permitido) {
    return NextResponse.json({ erro: 'rate_limit' }, { status: 429, headers });
  }

  const { id } = await ctx.params;
  if (!uuidRegex.test(id)) {
    return NextResponse.json(
      { erro: 'id_invalido' },
      { status: 400, headers },
    );
  }

  try {
    const ficha = await obterFichaTriagem(
      triagemRepository,
      papeisRepository,
      id,
      usuario.id,
    );
    if (!ficha) {
      return NextResponse.json(
        { erro: 'nao_encontrada' },
        { status: 404, headers },
      );
    }
    const eventos = await triagemRepository.listarEventos(id);
    return NextResponse.json({ ficha, eventos }, { headers });
  } catch (e) {
    return respostaDeErro(
      'api triagem/[id] GET',
      { usuarioId: usuario.id, fichaId: id },
      e,
    );
  }
}
