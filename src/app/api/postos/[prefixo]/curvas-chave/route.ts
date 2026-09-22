import { NextResponse, type NextRequest } from 'next/server';
import { exigirUsuario } from '@/app/api/_helpers/auth';
import { respostaDeErro } from '@/app/api/_helpers/erros';
import { PostoNaoEncontrado } from '@/domain/errors';
import { vazaoPostoRepository } from '@/infrastructure/repositories';
import {
  POLITICAS,
  aplicarHeadersRateLimit,
  consumirRateLimit,
} from '@/infrastructure/security/rate-limit';
import { logger } from '@/infrastructure/logging/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/postos/[prefixo]/curvas-chave
 *
 * Curvas-chave do posto com vigência, qualidade, consistência e os trechos da
 * equação (K, H, N, I) como o órgão gravou. Somente exibição: nada é calculado
 * a partir delas. Sem paginação (o maior posto tem 60 curvas). Posto sem curva
 * responde 200 com lista vazia; prefixo inexistente responde 404.
 */
export async function GET(
  _request: NextRequest,
  contexto: { params: Promise<{ prefixo: string }> },
) {
  const auth = await exigirUsuario();
  if (auth instanceof NextResponse) return auth;
  const usuario = auth;

  const headers = new Headers();
  const rl = consumirRateLimit(POLITICAS.leituraMonitor, usuario.id);
  aplicarHeadersRateLimit(headers, POLITICAS.leituraMonitor, rl);
  if (!rl.permitido) {
    return NextResponse.json(
      { erro: 'rate_limit', mensagem: 'Muitas requisições. Tente em instantes.' },
      { status: 429, headers },
    );
  }

  const alvo = decodeURIComponent((await contexto.params).prefixo).trim();

  if (vazaoPostoRepository === null) {
    return NextResponse.json(
      {
        erro: 'origem_indisponivel',
        mensagem:
          'As curvas-chave vêm do banco do órgão, que não está configurado neste ambiente.',
      },
      { status: 501, headers },
    );
  }

  try {
    const curvas = await vazaoPostoRepository.listarCurvasChave(alvo);
    if (curvas === null) throw new PostoNaoEncontrado(alvo);

    logger.info(
      'postos.vazao.curvas',
      { usuarioId: usuario.id, prefixo: alvo, total: curvas.length },
      'Curvas-chave listadas',
    );

    return NextResponse.json(
      { prefixo: alvo, total: curvas.length, curvas },
      { status: 200, headers },
    );
  } catch (e) {
    return respostaDeErro(
      'GET /api/postos/[prefixo]/curvas-chave',
      { usuarioId: usuario.id, prefixo: alvo },
      e,
    );
  }
}
