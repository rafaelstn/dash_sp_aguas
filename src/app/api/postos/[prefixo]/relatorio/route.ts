import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { postosRepository } from '@/infrastructure/repositories';
import { exigirUsuario } from '@/app/api/_helpers/auth';
import { montarMarkdownRelatorioPosto } from '@/infrastructure/relatorio/markdown-relatorio';
import { montarHtmlRelatorio } from '@/infrastructure/relatorio/html-relatorio';
import {
  htmlParaPdf,
  RenderizadorPdfIndisponivel,
} from '@/infrastructure/relatorio/pdf-relatorio';
import { logger } from '@/infrastructure/logging/logger';
import { respostaDeErro } from '@/app/api/_helpers/erros';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/postos/[prefixo]/relatorio
 *
 * Gera o relatório oficial do posto em PDF (identificação, localização,
 * operação e períodos de medição ANA). Requer sessão. O frontend navega
 * direto para esta URL (download), então a auth vem pelo cookie de sessão.
 */
export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ prefixo: string }> },
) {
  const auth = await exigirUsuario();
  if (auth instanceof NextResponse) return auth;

  const { prefixo: prefixoRaw } = await ctx.params;
  const prefixo = decodeURIComponent(prefixoRaw);

  try {
    const posto = await postosRepository.buscarPorPrefixo(prefixo);
    if (!posto || posto.deletedAt !== null) {
      return NextResponse.json(
        { erro: 'nao_encontrado', mensagem: 'Posto não encontrado.' },
        { status: 404 },
      );
    }

    const markdown = montarMarkdownRelatorioPosto(posto);
    const html = montarHtmlRelatorio(markdown);
    const pdf = await htmlParaPdf(html);

    const nomeArquivo = `relatorio-${prefixo.replace(/[^\w.-]+/g, '_')}.pdf`;
    // Mesmo cast dos demais downloads binarios: `Buffer<ArrayBufferLike>` nao
    // casa com `BodyInit` nos tipos do Node 22, mas Buffer E um Uint8Array.
    return new NextResponse(pdf as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${nomeArquivo}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    const correlationId = randomUUID();
    if (e instanceof RenderizadorPdfIndisponivel) {
      logger.error(
        'relatorio_renderizador_indisponivel',
        { correlationId, rota: 'GET /api/postos/[prefixo]/relatorio', prefixo },
        'Renderizador de PDF indisponível no ambiente',
      );
      return NextResponse.json(
        {
          erro: 'servico_indisponivel',
          mensagem: 'Geração de relatório indisponível no momento. Contate o administrador.',
          correlationId,
        },
        { status: 503 },
      );
    }
    return respostaDeErro('GET /api/postos/[prefixo]/relatorio', { prefixo }, e);
  }
}
