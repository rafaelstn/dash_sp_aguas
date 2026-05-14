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

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const corpoSchema = z.object({
  estacaoIds: z.array(z.string().regex(uuidRegex)).min(1).max(500),
  acao: z.enum([
    'marcar_revisada',
    'descartar',
    'aceitar_sugestao_municipio',
    'restaurar',
  ]),
  justificativa: z.string().max(4000).optional(),
});

/**
 * POST /api/inventario-ana/bulk
 *
 * Aplica ação em massa sobre múltiplas estações do lote atual.
 *
 * Ações:
 *   - marcar_revisada           sinaliza que aprovador conferiu (manual)
 *   - descartar                 estação não pertence à rede SP, ignorar
 *   - aceitar_sugestao_municipio aplica municipio_sugerido como correção
 *   - restaurar                 volta para pendente
 *
 * Limite: 500 estações por chamada (capacidade do `aplicarBulk`).
 */
export async function POST(request: NextRequest) {
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
  const resultado = await anaRevisaoRepository.aplicarBulk(
    lote.id,
    {
      estacaoIds: corpo.estacaoIds,
      acao: corpo.acao,
      justificativa: corpo.justificativa,
    },
    {
      usuarioId: usuario.id,
      ip: ip === 'unknown' ? null : ip,
      userAgent: request.headers.get('user-agent'),
    },
  );

  return NextResponse.json(resultado, { headers });
}
