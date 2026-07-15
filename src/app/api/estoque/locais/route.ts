import { NextResponse, type NextRequest } from 'next/server';
import { estoqueLocaisRepository } from '@/infrastructure/repositories';
import { exigirUsuario, exigirAdmin } from '@/app/api/_helpers/auth';
import { respostaDeErro } from '@/app/api/_helpers/erros';
import { logger } from '@/infrastructure/logging/logger';
import { checarRateLimit } from '../_rl';
import { localCriarSchema, motivosZod } from '../_schemas';
import { ehUnidadeFisica } from '@/domain/estoque/local';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/estoque/locais — lista locais (filtro unidade). Leitura: exigirUsuario. */
export async function GET(request: NextRequest) {
  const auth = await exigirUsuario();
  if (auth instanceof NextResponse) return auth;
  const { headers, resposta } = checarRateLimit('leituraEstoque', auth.id);
  if (resposta) return resposta;

  try {
    const unidade = request.nextUrl.searchParams.get('unidade');
    const itens = await estoqueLocaisRepository.listar({
      unidade: ehUnidadeFisica(unidade) ? unidade : undefined,
    });
    return NextResponse.json({ itens, total: itens.length }, { status: 200, headers });
  } catch (e) {
    return respostaDeErro('GET /api/estoque/locais', { usuarioId: auth.id }, e);
  }
}

/** POST /api/estoque/locais — cria local. Escrita: exigirAdmin. */
export async function POST(request: NextRequest) {
  const auth = await exigirAdmin();
  if (auth instanceof NextResponse) return auth;
  const { headers, resposta } = checarRateLimit('movimentacaoEstoque', auth.id);
  if (resposta) return resposta;

  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ erro: 'json_invalido' }, { status: 400, headers });
  }
  const parsed = localCriarSchema.safeParse(corpo);
  if (!parsed.success) {
    return NextResponse.json(
      { erro: 'body_invalido', motivos: motivosZod(parsed.error) },
      { status: 400, headers },
    );
  }

  try {
    const local = await estoqueLocaisRepository.criar(parsed.data);
    logger.info(
      'estoque.locais.criado',
      { usuarioId: auth.id, localId: local.id, unidade: local.unidade },
      'Local de estoque criado',
    );
    return NextResponse.json(local, { status: 201, headers });
  } catch (e) {
    return respostaDeErro('POST /api/estoque/locais', { usuarioId: auth.id }, e);
  }
}
