import { NextResponse, type NextRequest } from 'next/server';
import { estoqueCategoriasRepository } from '@/infrastructure/repositories';
import { exigirUsuario, exigirAdmin } from '@/app/api/_helpers/auth';
import { respostaDeErro } from '@/app/api/_helpers/erros';
import { logger } from '@/infrastructure/logging/logger';
import { checarRateLimit } from '../_rl';
import { categoriaSchema, motivosZod } from '../_schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/estoque/categorias — lista. Leitura: exigirUsuario. */
export async function GET() {
  const auth = await exigirUsuario();
  if (auth instanceof NextResponse) return auth;
  const { headers, resposta } = checarRateLimit('leituraEstoque', auth.id);
  if (resposta) return resposta;

  try {
    const itens = await estoqueCategoriasRepository.listar();
    return NextResponse.json({ itens, total: itens.length }, { status: 200, headers });
  } catch (e) {
    return respostaDeErro('GET /api/estoque/categorias', { usuarioId: auth.id }, e);
  }
}

/** POST /api/estoque/categorias — cria. Escrita: exigirAdmin. */
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
  const parsed = categoriaSchema.safeParse(corpo);
  if (!parsed.success) {
    return NextResponse.json(
      { erro: 'body_invalido', motivos: motivosZod(parsed.error) },
      { status: 400, headers },
    );
  }

  try {
    const categoria = await estoqueCategoriasRepository.criar(parsed.data);
    logger.info(
      'estoque.categorias.criada',
      { usuarioId: auth.id, categoriaId: categoria.id },
      'Categoria de estoque criada',
    );
    return NextResponse.json(categoria, { status: 201, headers });
  } catch (e) {
    return respostaDeErro('POST /api/estoque/categorias', { usuarioId: auth.id }, e);
  }
}
