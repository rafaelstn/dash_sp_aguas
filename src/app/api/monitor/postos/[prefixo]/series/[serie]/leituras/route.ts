import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { seriesMedicaoRepository } from '@/infrastructure/repositories';
import { eSerieMedicao, SERIES_MEDICAO } from '@/domain/monitor/serie-medicao';
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
 * Teto de itens por página.
 *
 * O maior posto da base tem 41.002 leituras numa série só, então "traga tudo"
 * não é opção nem com o servidor respondendo rápido: o custo estaria no
 * navegador. MEDIDO: uma página de 500 leituras sai em 74 ms, e com deslocamento
 * de 30.000 sai em 75 ms, ou seja, a paginação não degrada com a profundidade.
 */
const POR_PAGINA_MAXIMO = 1000;
const POR_PAGINA_PADRAO = 200;

const esquemaPaginacao = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(POR_PAGINA_MAXIMO).default(POR_PAGINA_PADRAO),
});

/**
 * GET /api/monitor/postos/[prefixo]/series/[serie]/leituras
 *
 * Leituras CRUAS de uma série no período, paginadas e ordenadas por momento
 * crescente. Só responde com período explícito: a série do órgão é histórica e
 * um período padrão devolveria vazio para toda a base (ver `janela-serie.ts`).
 *
 * Query: ?desde=AAAA-MM-DD&ate=AAAA-MM-DD (obrigatórios), &pagina, &porPagina.
 *
 * Cada item traz `valor` (nulo quando a origem gravou o valor sentinela) e
 * `bruto` (o que está gravado lá, inclusive a sentinela). Os dois existem porque
 * quem confere com o órgão precisa ver o que o banco deles diz, e não a nossa
 * interpretação dele.
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

  const paginacao = esquemaPaginacao.safeParse({
    pagina: request.nextUrl.searchParams.get('pagina') ?? undefined,
    porPagina: request.nextUrl.searchParams.get('porPagina') ?? undefined,
  });
  if (!paginacao.success) {
    return NextResponse.json(
      {
        erro: 'paginacao_invalida',
        mensagem: `Página a partir de 1 e no máximo ${POR_PAGINA_MAXIMO} itens por página.`,
        motivos: paginacao.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      },
      { status: 400, headers },
    );
  }

  try {
    const pagina = await seriesMedicaoRepository.listarLeituras(
      alvo,
      serie,
      janela,
      paginacao.data,
    );

    logger.info(
      'monitor.series.leituras',
      {
        usuarioId: usuario.id,
        prefixo: alvo,
        serie,
        desde: janela.desde.toISOString(),
        ate: janela.ate.toISOString(),
        total: pagina.total,
        devolvidas: pagina.itens.length,
      },
      'Leituras de série histórica listadas',
    );

    return NextResponse.json(
      {
        prefixo: alvo,
        serie,
        definicao: SERIES_MEDICAO[serie],
        pagina: paginacao.data.pagina,
        porPagina: paginacao.data.porPagina,
        total: pagina.total,
        itens: pagina.itens,
      },
      { status: 200, headers },
    );
  } catch (e) {
    return respostaDeErro(
      'GET /api/monitor/postos/[prefixo]/series/[serie]/leituras',
      { usuarioId: usuario.id, prefixo: alvo, serie },
      e,
    );
  }
}
