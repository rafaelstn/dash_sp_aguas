import { NextResponse, type NextRequest } from 'next/server';
import { postosRepository, seriesMedicaoRepository } from '@/infrastructure/repositories';
import { sibhClient } from '@/infrastructure/sibh/sibh-client';
import { eSerieMedicao, SERIES_MEDICAO } from '@/domain/monitor/serie-medicao';
import { compararSerieComSibh } from '@/application/use-cases/monitor/comparar-serie-com-sibh';
import { exigirUsuario } from '@/app/api/_helpers/auth';
import { respostaDeErro } from '@/app/api/_helpers/erros';
import { lerJanela } from '@/app/api/_helpers/janela-serie';
import {
  POLITICAS,
  aplicarHeadersRateLimit,
  consumirRateLimit,
} from '@/infrastructure/security/rate-limit';
import { logger } from '@/infrastructure/logging/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/monitor/postos/[prefixo]/series/[serie]/diario
 *
 * Resumo DIÁRIO de uma série no período, pelo critério da série (soma para
 * chuva, média com mínimo e máximo para nível), e, quando pedido, o comparativo
 * com o SIBH.
 *
 * Query: ?desde=AAAA-MM-DD&ate=AAAA-MM-DD (obrigatórios) e &comparar=sibh.
 *
 * O comparativo é OPCIONAL e desligado por padrão de propósito: ele fala com uma
 * API pública, que num servidor sem saída para a internet é uma espera até o
 * tempo esgotar. A tela pede o comparativo quando quiser comparar, e o resumo
 * diário continua respondendo sozinho.
 *
 * O campo `comparativo.estado` tem QUATRO valores, e eles não são intercambiáveis:
 * `sem_correspondencia`, `sem_dado_no_periodo`, `dado_dos_dois_lados` e
 * `origem_indisponivel`. O contrato está em
 * `use-cases/monitor/comparar-serie-com-sibh.ts`.
 */
export async function GET(
  request: NextRequest,
  contexto: { params: Promise<{ prefixo: string; serie: string }> },
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

  const params = await contexto.params;
  const alvo = decodeURIComponent(params.prefixo).trim();
  const serie = decodeURIComponent(params.serie).trim();

  if (!eSerieMedicao(serie)) {
    return NextResponse.json(
      {
        erro: 'serie_desconhecida',
        mensagem: `Série desconhecida: ${serie}.`,
        series: Object.keys(SERIES_MEDICAO),
      },
      { status: 400, headers },
    );
  }

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

  const janela = lerJanela(request.nextUrl.searchParams, headers);
  if (janela instanceof NextResponse) return janela;

  const querComparar = request.nextUrl.searchParams.get('comparar') === 'sibh';

  try {
    const dias = await seriesMedicaoRepository.agregarPorDia(alvo, serie, janela);

    const comparativo = querComparar
      ? await compararSerieComSibh(
          seriesMedicaoRepository,
          sibhClient,
          {
            prefixo: alvo,
            prefixoAna: (await postosRepository.buscarPorPrefixo(alvo))?.prefixoAna ?? null,
          },
          serie,
          janela,
          (erro) =>
            logger.warn(
              'monitor.series.sibh_indisponivel',
              {
                usuarioId: usuario.id,
                prefixo: alvo,
                serie,
                motivo: erro instanceof Error ? erro.message : String(erro),
              },
              'Comparativo com o SIBH não pôde ser feito',
            ),
        )
      : null;

    logger.info(
      'monitor.series.diario',
      {
        usuarioId: usuario.id,
        prefixo: alvo,
        serie,
        desde: janela.desde.toISOString(),
        ate: janela.ate.toISOString(),
        dias: dias.length,
        diasSemMedida: dias.filter((d) => d.valor === null).length,
        comparativo: comparativo?.estado ?? 'nao_pedido',
      },
      'Resumo diário de série histórica consultado',
    );

    return NextResponse.json(
      {
        prefixo: alvo,
        serie,
        definicao: SERIES_MEDICAO[serie],
        dias,
        comparativo,
      },
      { status: 200, headers },
    );
  } catch (e) {
    return respostaDeErro(
      'GET /api/monitor/postos/[prefixo]/series/[serie]/diario',
      { usuarioId: usuario.id, prefixo: alvo, serie },
      e,
    );
  }
}
