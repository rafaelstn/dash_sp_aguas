import { NextResponse, type NextRequest } from 'next/server';
import { estoqueMateriaisRepository } from '@/infrastructure/repositories';
import { exigirUsuario, exigirAdmin } from '@/app/api/_helpers/auth';
import { respostaDeErro } from '@/app/api/_helpers/erros';
import { logger } from '@/infrastructure/logging/logger';
import { checarRateLimit } from '../_rl';
import { materialCriarSchema, motivosZod, lerPaginacao } from '../_schemas';
import type { FiltrosMaterial, Natureza } from '@/domain/estoque/material';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/estoque/materiais — lista/filtra o catalogo. Leitura: exigirUsuario.
 * Filtros: natureza, categoria, busca, apenasAtivos, pagina, porPagina.
 */
export async function GET(request: NextRequest) {
  const auth = await exigirUsuario();
  if (auth instanceof NextResponse) return auth;
  const { headers, resposta } = checarRateLimit('leituraEstoque', auth.id);
  if (resposta) return resposta;

  try {
    const sp = request.nextUrl.searchParams;
    const naturezaBruta = sp.get('natureza');
    const natureza: Natureza | undefined =
      naturezaBruta === 'serializado' || naturezaBruta === 'quantificavel'
        ? naturezaBruta
        : undefined;
    const { pagina, porPagina } = lerPaginacao(sp);
    const filtros: FiltrosMaterial = {
      natureza,
      categoriaId: sp.get('categoria') ?? undefined,
      busca: sp.get('busca')?.trim() || undefined,
      apenasAtivos: sp.get('apenasAtivos') === 'true',
      pagina,
      porPagina,
    };

    const { itens, total } = await estoqueMateriaisRepository.listar(filtros);
    return NextResponse.json({ itens, total, pagina, porPagina }, { status: 200, headers });
  } catch (e) {
    return respostaDeErro('GET /api/estoque/materiais', { usuarioId: auth.id }, e);
  }
}

/** POST /api/estoque/materiais — cria material. Escrita: exigirAdmin. */
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
  const parsed = materialCriarSchema.safeParse(corpo);
  if (!parsed.success) {
    return NextResponse.json(
      { erro: 'body_invalido', motivos: motivosZod(parsed.error) },
      { status: 400, headers },
    );
  }

  try {
    const material = await estoqueMateriaisRepository.criar(parsed.data);
    logger.info(
      'estoque.materiais.criado',
      { usuarioId: auth.id, materialId: material.id, natureza: material.natureza },
      'Material de estoque criado',
    );
    return NextResponse.json(material, { status: 201, headers });
  } catch (e) {
    return respostaDeErro('POST /api/estoque/materiais', { usuarioId: auth.id }, e);
  }
}
