import { NextResponse, type NextRequest } from 'next/server';
import {
  postosRepository,
  papeisRepository,
} from '@/infrastructure/repositories';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import {
  POLITICAS,
  aplicarHeadersRateLimit,
  consumirRateLimit,
  extrairIp,
} from '@/infrastructure/security/rate-limit';
import { sql } from '@/infrastructure/db/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/postos/[prefixo]/aceitar-coord-ibge
 *
 * Aplica em postos.latitude/longitude o ponto sugerido pelo PostGIS
 * (mais próximo da coord atual que ainda está dentro do município
 * declarado). Audit obrigatório.
 *
 * Pré-condição: postos.lat_sugerida_ibge e lng_sugerida_ibge devem estar
 * preenchidos (rodar scripts/calcular_coord_sugerida_postos.py antes).
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ prefixo: string }> },
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

  const { prefixo: prefixoRaw } = await ctx.params;
  const prefixo = decodeURIComponent(prefixoRaw);

  const linhas = await sql<
    Array<{
      lat_atual: string | null;
      lng_atual: string | null;
      lat_sugerida_ibge: string | null;
      lng_sugerida_ibge: string | null;
      distancia_sugerida_m: string | null;
    }>
  >`
    SELECT latitude::text AS lat_atual,
           longitude::text AS lng_atual,
           lat_sugerida_ibge::text,
           lng_sugerida_ibge::text,
           distancia_sugerida_m::text
      FROM postos
     WHERE prefixo = ${prefixo} AND deleted_at IS NULL
     LIMIT 1
  `;
  const r = linhas[0];
  if (!r) {
    return NextResponse.json(
      { erro: 'nao_encontrado' },
      { status: 404, headers },
    );
  }
  if (!r.lat_sugerida_ibge || !r.lng_sugerida_ibge) {
    return NextResponse.json(
      {
        erro: 'sem_sugestao',
        mensagem:
          'Posto não tem coordenada sugerida calculada. Rodar scripts/calcular_coord_sugerida_postos.py primeiro.',
      },
      { status: 409, headers },
    );
  }

  const ip = extrairIp(request);
  const deslocKm = r.distancia_sugerida_m
    ? (Number(r.distancia_sugerida_m) / 1000).toFixed(1)
    : '?';

  try {
    const posto = await postosRepository.atualizar(
      prefixo,
      {
        latitude: Number(r.lat_sugerida_ibge),
        longitude: Number(r.lng_sugerida_ibge),
      },
      {
        usuarioId: usuario.id,
        ip: ip === 'unknown' ? null : ip,
        userAgent: request.headers.get('user-agent'),
        origemEvento: 'aceitar_coord_postgis',
        observacao: `Coord ajustada via PostGIS para o ponto mais próximo dentro do município declarado. Deslocamento ${deslocKm} km. Coord anterior: (${r.lat_atual}, ${r.lng_atual}).`,
      },
    );
    return NextResponse.json({ posto }, { headers });
  } catch (e) {
    return NextResponse.json(
      {
        erro: 'falha_atualizacao',
        mensagem: e instanceof Error ? e.message : 'Falha.',
      },
      { status: 500, headers },
    );
  }
}
