import { NextResponse, type NextRequest } from 'next/server';
import { seriesMedicaoRepository } from '@/infrastructure/repositories';
import { exigirUsuario } from '@/app/api/_helpers/auth';
import { respostaDeErro } from '@/app/api/_helpers/erros';
import {
  POLITICAS,
  aplicarHeadersRateLimit,
  consumirRateLimit,
} from '@/infrastructure/security/rate-limit';
import { logger } from '@/infrastructure/logging/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/monitor/postos/[prefixo]/series
 *
 * Retrato das CINCO séries históricas do posto no banco do órgão, SEM carregar
 * leitura nenhuma. É esta a rota que a tela chama ao abrir.
 *
 * O pedido do proprietário foi explícito: "caso eu queira carregar todas as
 * medições do dia eu consiga, mas ela não precisa abrir de cara para não pesar
 * o processamento". As leituras vêm por
 * `.../series/[serie]/leituras` e `.../series/[serie]/diario`, só depois de a
 * pessoa escolher a janela.
 *
 * MEDIDO em 03/09/2026 contra a produção do órgão: de 35 ms a 289 ms, incluindo
 * o pior posto de cada uma das cinco séries.
 *
 * Respostas:
 *   200 { prefixo, series: [...] }  sempre com as cinco, inclusive as zeradas.
 *   404 posto não existe no cadastro do órgão.
 *   501 este ambiente não tem a origem das séries configurada.
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

  const { prefixo } = await contexto.params;
  const alvo = decodeURIComponent(prefixo).trim();

  // Origem ausente é 501, e não 200 com lista vazia. Lista vazia diria que o
  // posto não tem série, o que é uma afirmação sobre o DADO; o que existe aqui
  // é uma limitação do AMBIENTE, e as duas pedem ação diferente.
  if (seriesMedicaoRepository === null) {
    return NextResponse.json(
      {
        erro: 'origem_indisponivel',
        mensagem:
          'As séries históricas vêm do banco do órgão, que não está configurado neste ambiente.',
      },
      { status: 501, headers },
    );
  }

  try {
    const series = await seriesMedicaoRepository.resumoPorPosto(alvo);
    if (series === null) {
      return NextResponse.json(
        { erro: 'nao_encontrado', mensagem: `Posto não encontrado: ${alvo}` },
        { status: 404, headers },
      );
    }

    logger.info(
      'monitor.series.resumo',
      {
        usuarioId: usuario.id,
        prefixo: alvo,
        comSerie: series.filter((s) => s.leituras > 0).map((s) => s.serie),
        leiturasTotais: series.reduce((soma, s) => soma + s.leituras, 0),
      },
      'Resumo de séries históricas do posto consultado',
    );

    return NextResponse.json({ prefixo: alvo, series }, { status: 200, headers });
  } catch (e) {
    return respostaDeErro(
      'GET /api/monitor/postos/[prefixo]/series',
      { usuarioId: usuario.id, prefixo: alvo },
      e,
    );
  }
}
