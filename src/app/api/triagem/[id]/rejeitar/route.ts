import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  papeisRepository,
  triagemRepository,
} from '@/infrastructure/repositories';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import { rejeitarFichaTriagem } from '@/application/use-cases/triagem/rejeitar-ficha-triagem';
import {
  POLITICAS,
  aplicarHeadersRateLimit,
  consumirRateLimit,
  extrairIp,
} from '@/infrastructure/security/rate-limit';
import { exigirSessaoAal2, respostaDeErro } from '../../_helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const corpoSchema = z.object({
  motivo: z.string().min(1).max(2000),
});

/**
 * POST /api/triagem/[id]/rejeitar
 * Recusa final. Body: { motivo: string ≥ 20 chars }.
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

  let corpo: z.infer<typeof corpoSchema>;
  try {
    const bruto = await request.json();
    const parseado = corpoSchema.safeParse(bruto);
    if (!parseado.success) {
      return NextResponse.json(
        {
          erro: 'body_invalido',
          motivos: parseado.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
        },
        { status: 400, headers },
      );
    }
    corpo = parseado.data;
  } catch {
    return NextResponse.json(
      { erro: 'json_invalido' },
      { status: 400, headers },
    );
  }

  const ip = extrairIp(request);
  const metadata = {
    ip: ip === 'unknown' ? null : ip,
    userAgent: request.headers.get('user-agent'),
  };

  try {
    // Camada 3 MFA — sessão precisa estar em aal2.
    await exigirSessaoAal2(usuario.id);
    const ficha = await rejeitarFichaTriagem(
      triagemRepository,
      papeisRepository,
      id,
      usuario.id,
      corpo.motivo,
      metadata,
    );
    return NextResponse.json({ triagem: ficha }, { headers });
  } catch (e) {
    return respostaDeErro(
      'api triagem/[id]/rejeitar POST',
      { usuarioId: usuario.id, fichaId: id },
      e,
    );
  }
}
