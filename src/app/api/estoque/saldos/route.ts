import { NextResponse, type NextRequest } from 'next/server';
import { estoqueSaldosRepository } from '@/infrastructure/repositories';
import { exigirUsuario } from '@/app/api/_helpers/auth';
import { respostaDeErro } from '@/app/api/_helpers/erros';
import { checarRateLimit } from '../_rl';
import { ehUnidadeFisica } from '@/domain/estoque/local';
import type { FiltrosSaldo } from '@/domain/estoque/saldo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/estoque/saldos — consulta saldo de quantificaveis (com contexto:
 * descricao do material, rotulo/unidade do local). Leitura: exigirUsuario.
 * Filtros: materialId, local, unidade.
 */
export async function GET(request: NextRequest) {
  const auth = await exigirUsuario();
  if (auth instanceof NextResponse) return auth;
  const { headers, resposta } = checarRateLimit('leituraEstoque', auth.id);
  if (resposta) return resposta;

  try {
    const sp = request.nextUrl.searchParams;
    const unidade = sp.get('unidade');
    const filtros: FiltrosSaldo = {
      materialId: sp.get('materialId') ?? undefined,
      localId: sp.get('local') ?? undefined,
      unidade: ehUnidadeFisica(unidade) ? unidade : undefined,
    };
    const itens = await estoqueSaldosRepository.listar(filtros);
    return NextResponse.json({ itens, total: itens.length }, { status: 200, headers });
  } catch (e) {
    return respostaDeErro('GET /api/estoque/saldos', { usuarioId: auth.id }, e);
  }
}
