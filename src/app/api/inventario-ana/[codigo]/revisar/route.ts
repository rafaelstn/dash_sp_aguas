import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  anaRevisaoRepository,
  papeisRepository,
} from '@/infrastructure/repositories';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import {
  POLITICAS,
  aplicarHeadersRateLimit,
  consumirRateLimit,
  extrairIp,
} from '@/infrastructure/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const corpoSchema = z.object({
  correcoes: z.record(z.string(), z.unknown()).optional(),
  justificativa: z.string().min(0).max(4000).nullable().optional(),
  novoStatus: z.enum([
    'pendente',
    'em_revisao',
    'revisada',
    'descartada',
    'sem_match',
    'promovida_a_posto',
  ]),
});

/**
 * POST /api/inventario-ana/[codigo]/revisar
 *
 * Aplica correção / muda status de uma estação. Audit trail gravado.
 *
 * Auth: papel `aprovador` (governo.md). Rate-limit: 60/min por usuário.
 */
export async function POST(
  request: NextRequest,
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

  const rl = consumirRateLimit(POLITICAS.decisaoInventarioAna, usuario.id);
  const headers = new Headers();
  aplicarHeadersRateLimit(headers, POLITICAS.decisaoInventarioAna, rl);
  if (!rl.permitido) {
    return NextResponse.json(
      { erro: 'rate_limit' },
      { status: 429, headers },
    );
  }

  const lote = await anaRevisaoRepository.loteAtual();
  if (!lote) {
    return NextResponse.json({ erro: 'sem_lote' }, { status: 404, headers });
  }

  const { codigo } = await ctx.params;
  const atual = await anaRevisaoRepository.obterPorCodigo(lote.id, codigo);
  if (!atual) {
    return NextResponse.json(
      { erro: 'nao_encontrada' },
      { status: 404, headers },
    );
  }

  let corpo;
  try {
    const bruto = await request.json();
    const parsed = corpoSchema.safeParse(bruto);
    if (!parsed.success) {
      return NextResponse.json(
        {
          erro: 'body_invalido',
          motivos: parsed.error.issues.map(
            (i) => `${i.path.join('.')}: ${i.message}`,
          ),
        },
        { status: 400, headers },
      );
    }
    corpo = parsed.data;
  } catch {
    return NextResponse.json(
      { erro: 'json_invalido' },
      { status: 400, headers },
    );
  }

  const ip = extrairIp(request);
  try {
    const estacao = await anaRevisaoRepository.aplicarRevisao(
      atual.id,
      {
        correcoes: corpo.correcoes,
        justificativa: corpo.justificativa ?? null,
        novoStatus: corpo.novoStatus,
      },
      {
        usuarioId: usuario.id,
        ip: ip === 'unknown' ? null : ip,
        userAgent: request.headers.get('user-agent'),
      },
    );
    return NextResponse.json({ estacao }, { headers });
  } catch (e) {
    return NextResponse.json(
      {
        erro: 'falha_revisao',
        mensagem:
          e instanceof Error ? e.message : 'Não foi possível aplicar a revisão.',
      },
      { status: 409, headers },
    );
  }
}
