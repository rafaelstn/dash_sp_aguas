import { NextResponse, type NextRequest } from 'next/server';
import {
  anaRevisaoRepository,
  papeisRepository,
  postosRepository,
} from '@/infrastructure/repositories';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import { sql } from '@/infrastructure/db/client';
import {
  POLITICAS,
  aplicarHeadersRateLimit,
  consumirRateLimit,
  extrairIp,
} from '@/infrastructure/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/inventario-ana/[codigo]/aceitar-match
 *
 * Vincula a estação ANA ao posto sugerido (match_sugerido_posto_id):
 * - postos.prefixo_ana = estação.codigo_ana
 * - ana_revisao_estacao.posto_id = match_sugerido_posto_id
 * - ana_revisao_estacao.status = 'revisada'
 * - audit nas duas tabelas
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
    return NextResponse.json({ erro: 'rate_limit' }, { status: 429, headers });
  }

  const lote = await anaRevisaoRepository.loteAtual();
  if (!lote) {
    return NextResponse.json({ erro: 'sem_lote' }, { status: 404, headers });
  }

  const { codigo } = await ctx.params;
  const linhas = await sql<
    Array<{
      id: string;
      match_sugerido_posto_id: string | null;
      prefixo_sugerido: string | null;
    }>
  >`
    SELECT e.id, e.match_sugerido_posto_id, p.prefixo AS prefixo_sugerido
      FROM ana_revisao_estacao e
      LEFT JOIN postos p ON p.id = e.match_sugerido_posto_id
     WHERE e.lote_id = ${lote.id} AND e.codigo_ana = ${codigo}
     LIMIT 1
  `;
  const r = linhas[0];
  if (!r) {
    return NextResponse.json(
      { erro: 'nao_encontrada' },
      { status: 404, headers },
    );
  }
  if (!r.match_sugerido_posto_id || !r.prefixo_sugerido) {
    return NextResponse.json(
      { erro: 'sem_sugestao' },
      { status: 409, headers },
    );
  }

  const ip = extrairIp(request);
  try {
    // 1. Atualiza postos.prefixo_ana
    await postosRepository.atualizar(
      r.prefixo_sugerido,
      { prefixoAna: codigo },
      {
        usuarioId: usuario.id,
        ip: ip === 'unknown' ? null : ip,
        userAgent: request.headers.get('user-agent'),
        origemEvento: 'aceitar_match_ana',
        observacao: `Aceito match: estação ANA ${codigo} vinculada a este posto.`,
        referenciaExternaId: r.id,
      },
    );

    // 2. Atualiza ana_revisao_estacao: liga ao posto e marca como revisada
    await sql`
      UPDATE ana_revisao_estacao
         SET posto_id = ${r.match_sugerido_posto_id}::uuid,
             match_tipo = 'manual',
             status = 'revisada',
             revisado_por = ${usuario.id}::uuid,
             revisado_em = NOW()
       WHERE id = ${r.id}::uuid
    `;

    await sql`
      INSERT INTO ana_revisao_evento
        (estacao_id, evento, ator_id, valores_depois, observacao, ip, user_agent)
      VALUES (
        ${r.id}::uuid,
        'revisada',
        ${usuario.id}::uuid,
        ${JSON.stringify({
          posto_id: r.match_sugerido_posto_id,
          posto_prefixo: r.prefixo_sugerido,
          status: 'revisada',
        })}::jsonb,
        ${`Match aceito: vinculado ao posto ${r.prefixo_sugerido}`},
        ${ip === 'unknown' ? null : ip}::inet,
        ${request.headers.get('user-agent')}
      )
    `;

    return NextResponse.json({ ok: true, prefixo: r.prefixo_sugerido }, { headers });
  } catch (e) {
    return NextResponse.json(
      {
        erro: 'falha',
        mensagem: e instanceof Error ? e.message : 'Falha ao aceitar match.',
      },
      { status: 500, headers },
    );
  }
}
