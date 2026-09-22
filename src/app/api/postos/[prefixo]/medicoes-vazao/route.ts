import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
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

/** Página é para a tabela da tela; exportação completa não passa por esta rota. */
const POR_PAGINA_MAXIMO = 200;
const POR_PAGINA_PADRAO = 50;

const esquemaPaginacao = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(POR_PAGINA_MAXIMO).default(POR_PAGINA_PADRAO),
});

/**
 * GET /api/postos/[prefixo]/medicoes-vazao?pagina&porPagina
 *
 * Medições de vazão em campo do posto (`ResumoMedicaoVazoes`), da mais recente
 * para a mais antiga. Posto sem medição responde 200 com lista vazia; prefixo
 * inexistente responde 404.
 */
export async function GET(
  request: NextRequest,
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

  if (vazaoPostoRepository === null) {
    return NextResponse.json(
      {
        erro: 'origem_indisponivel',
        mensagem:
          'As medições de vazão vêm do banco do órgão, que não está configurado neste ambiente.',
      },
      { status: 501, headers },
    );
  }

  try {
    const pagina = await vazaoPostoRepository.listarMedicoes(alvo, paginacao.data);
    if (pagina === null) throw new PostoNaoEncontrado(alvo);

    logger.info(
      'postos.vazao.medicoes',
      {
        usuarioId: usuario.id,
        prefixo: alvo,
        total: pagina.total,
        devolvidas: pagina.itens.length,
      },
      'Medições de vazão listadas',
    );

    return NextResponse.json(
      {
        prefixo: alvo,
        pagina: paginacao.data.pagina,
        porPagina: paginacao.data.porPagina,
        total: pagina.total,
        itens: pagina.itens,
      },
      { status: 200, headers },
    );
  } catch (e) {
    return respostaDeErro(
      'GET /api/postos/[prefixo]/medicoes-vazao',
      { usuarioId: usuario.id, prefixo: alvo },
      e,
    );
  }
}
