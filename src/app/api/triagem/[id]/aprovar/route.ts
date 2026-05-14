import { NextResponse, type NextRequest } from 'next/server';
import {
  papeisRepository,
  triagemRepository,
} from '@/infrastructure/repositories';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import { aprovarFichaTriagem } from '@/application/use-cases/triagem/aprovar-ficha-triagem';
import {
  POLITICAS,
  aplicarHeadersRateLimit,
  consumirRateLimit,
  extrairIp,
} from '@/infrastructure/security/rate-limit';
import { respostaDeErro } from '../../_helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/triagem/[id]/aprovar
 * Promoção atômica fichas_triagem → fichas_visita.
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const usuario = await obterUsuarioAtual();
  if (!usuario) {
    return NextResponse.json({ erro: 'nao_autenticado' }, { status: 401 });
  }

  const rl = consumirRateLimit(POLITICAS.decisaoTriagem, usuario.id);
  const headers = new Headers();
  aplicarHeadersRateLimit(headers, POLITICAS.decisaoTriagem, rl);
  if (!rl.permitido) {
    return NextResponse.json({ erro: 'rate_limit' }, { status: 429, headers });
  }

  const { id } = await ctx.params;
  if (!uuidRegex.test(id)) {
    return NextResponse.json({ erro: 'id_invalido' }, { status: 400, headers });
  }

  const ip = extrairIp(request);
  const metadata = {
    ip: ip === 'unknown' ? null : ip,
    userAgent: request.headers.get('user-agent'),
  };

  try {
    const resultado = await aprovarFichaTriagem(
      triagemRepository,
      papeisRepository,
      id,
      usuario.id,
      metadata,
    );
    return NextResponse.json(
      {
        triagem: resultado.triagem,
        fichaVisitaId: resultado.fichaVisitaId,
      },
      { headers },
    );
  } catch (e) {
    return respostaDeErro(
      'api triagem/[id]/aprovar POST',
      { usuarioId: usuario.id, fichaId: id },
      e,
    );
  }
}
