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
 * POST /api/postos/[prefixo]/aceitar-municipio-ibge
 *
 * Atalho de UX: aplica em postos.municipio o valor de
 * postos.municipio_correto_ibge (município que o PostGIS detectou que
 * contém a coordenada). Usado pelo botão "Aceitar sugestão" na lista de
 * divergências. Audit obrigatório.
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

  // Lê a sugestão atual diretamente
  const linhas = await sql<
    Array<{ municipio_correto_ibge: string | null; municipio: string | null }>
  >`
    SELECT municipio_correto_ibge, municipio
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
  if (!r.municipio_correto_ibge) {
    return NextResponse.json(
      { erro: 'sem_sugestao', mensagem: 'Posto não tem sugestão de município (coord fora de qualquer município SP).' },
      { status: 409, headers },
    );
  }
  if (r.municipio_correto_ibge === r.municipio) {
    return NextResponse.json(
      { erro: 'sem_diferenca', mensagem: 'Município declarado já é o detectado pelo IBGE.' },
      { status: 409, headers },
    );
  }

  const ip = extrairIp(request);
  try {
    const posto = await postosRepository.atualizar(
      prefixo,
      { municipio: r.municipio_correto_ibge },
      {
        usuarioId: usuario.id,
        ip: ip === 'unknown' ? null : ip,
        userAgent: request.headers.get('user-agent'),
        origemEvento: 'aceitar_sugestao_postgis',
        observacao: `Aceito IBGE: "${r.municipio}" -> "${r.municipio_correto_ibge}" (via lista de divergências).`,
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
