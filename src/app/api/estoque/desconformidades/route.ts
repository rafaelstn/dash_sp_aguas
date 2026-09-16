import { NextResponse, type NextRequest } from 'next/server';
import { estoqueDesconformidadesRepository } from '@/infrastructure/repositories';
import { exigirUsuario } from '@/app/api/_helpers/auth';
import { respostaDeErro } from '@/app/api/_helpers/erros';
import { desconformidadeParaDTO } from '@/domain/estoque/desconformidade';
import { checarRateLimit } from '../_rl';
import { listarDesconformidadesQuerySchema, mensagemZod } from './_schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/estoque/desconformidades: fila de desconformidades da carga.
 * Leitura: exigirUsuario. Filtros: status, tipo, pagina, porPagina (máx. 200).
 * `contagem` ignora o filtro de status e respeita o de tipo.
 */
export async function GET(request: NextRequest) {
  const auth = await exigirUsuario();
  if (auth instanceof NextResponse) return auth;
  const { headers, resposta } = checarRateLimit('leituraEstoque', auth.id, request);
  if (resposta) return resposta;

  const parsed = listarDesconformidadesQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { erro: 'consulta_invalida', mensagem: mensagemZod(parsed.error) },
      { status: 400, headers },
    );
  }
  const { status, tipo, pagina, porPagina } = parsed.data;

  try {
    const resultado = await estoqueDesconformidadesRepository.listar({
      status,
      tipo,
      pagina,
      porPagina,
    });
    return NextResponse.json(
      {
        itens: resultado.itens.map(desconformidadeParaDTO),
        total: resultado.total,
        pagina,
        porPagina,
        contagem: resultado.contagem,
      },
      { status: 200, headers },
    );
  } catch (e) {
    return respostaDeErro('GET /api/estoque/desconformidades', { usuarioId: auth.id }, e);
  }
}
