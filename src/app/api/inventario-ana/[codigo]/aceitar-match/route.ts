import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import {
  anaRevisaoRepository,
  papeisRepository,
} from '@/infrastructure/repositories';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import { PostoNaoEncontrado, PostoRemovido } from '@/domain/errors';
import { logger } from '@/infrastructure/logging/logger';
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
  const sugestao = await anaRevisaoRepository.obterSugestaoMatch(lote.id, codigo);
  if (!sugestao) {
    return NextResponse.json(
      { erro: 'nao_encontrada' },
      { status: 404, headers },
    );
  }

  const ip = extrairIp(request);
  const ator = {
    usuarioId: usuario.id,
    ip: ip === 'unknown' ? null : ip,
    userAgent: request.headers.get('user-agent'),
  };

  try {
    // Atomicidade: as duas escritas (postos.prefixo_ana e a estação ANA)
    // acontecem na mesma transação dentro do repositório. Se a segunda
    // falhasse antes, o posto ficava com prefixo_ana setado e a estação
    // pendente (estado inconsistente sem compensação).
    await anaRevisaoRepository.aceitarMatch(
      {
        estacaoId: sugestao.estacaoId,
        postoIdSugerido: sugestao.matchSugeridoPostoId,
        prefixoSugerido: sugestao.prefixoSugerido,
        codigoAna: codigo,
        referenciaExternaId: sugestao.estacaoId,
        observacaoPosto: `Aceito match: estação ANA ${codigo} vinculada a este posto.`,
        origemEvento: 'aceitar_match_ana',
      },
      ator,
    );

    return NextResponse.json(
      { ok: true, prefixo: sugestao.prefixoSugerido },
      { headers },
    );
  } catch (e) {
    if (e instanceof PostoNaoEncontrado) {
      return NextResponse.json(
        { erro: 'posto_nao_encontrado' },
        { status: 404, headers },
      );
    }
    if (e instanceof PostoRemovido) {
      return NextResponse.json(
        { erro: 'posto_removido' },
        { status: 409, headers },
      );
    }
    const correlationId = randomUUID();
    logger.error(
      'erro_inesperado',
      {
        correlationId,
        rota: 'POST /api/inventario-ana/[codigo]/aceitar-match',
        codigo,
        prefixoSugerido: sugestao.prefixoSugerido,
        erro: String(e),
      },
      'Falha ao aceitar match ANA',
    );
    return NextResponse.json(
      {
        erro: 'erro_interno',
        mensagem: 'Falha ao aceitar match.',
        correlationId,
      },
      { status: 500, headers },
    );
  }
}
