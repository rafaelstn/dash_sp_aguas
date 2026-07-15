import { NextResponse, type NextRequest } from 'next/server';
import { estoqueUnidadesRepository } from '@/infrastructure/repositories';
import { exigirUsuario, exigirAdmin } from '@/app/api/_helpers/auth';
import { respostaDeErro } from '@/app/api/_helpers/erros';
import { logger } from '@/infrastructure/logging/logger';
import { checarRateLimit } from '../_rl';
import { unidadeCriarSchema, motivosZod, lerPaginacao } from '../_schemas';
import type { FiltrosUnidade } from '@/domain/estoque/unidade';
import { ehUnidadeFisica } from '@/domain/estoque/local';
import { ehEstadoValido } from '@/domain/estoque/estado';
import { ehStatusValido } from '@/domain/estoque/status-unidade';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/estoque/unidades — lista/filtra serializados. Leitura: exigirUsuario.
 * Filtros: unidade, local, estado, status, materialId, busca, pagina, porPagina.
 */
export async function GET(request: NextRequest) {
  const auth = await exigirUsuario();
  if (auth instanceof NextResponse) return auth;
  const { headers, resposta } = checarRateLimit('leituraEstoque', auth.id);
  if (resposta) return resposta;

  try {
    const sp = request.nextUrl.searchParams;
    const unidade = sp.get('unidade');
    const estado = sp.get('estado');
    const status = sp.get('status');
    const { pagina, porPagina } = lerPaginacao(sp);
    const filtros: FiltrosUnidade = {
      unidade: ehUnidadeFisica(unidade) ? unidade : undefined,
      localId: sp.get('local') ?? undefined,
      estado: ehEstadoValido(estado) ? estado : undefined,
      status: ehStatusValido(status) ? status : undefined,
      materialId: sp.get('materialId') ?? undefined,
      busca: sp.get('busca')?.trim() || undefined,
      pagina,
      porPagina,
    };
    const { itens, total } = await estoqueUnidadesRepository.listar(filtros);
    return NextResponse.json({ itens, total, pagina, porPagina }, { status: 200, headers });
  } catch (e) {
    return respostaDeErro('GET /api/estoque/unidades', { usuarioId: auth.id }, e);
  }
}

/** POST /api/estoque/unidades — cria unidade serializada. Escrita: exigirAdmin. */
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
  const parsed = unidadeCriarSchema.safeParse(corpo);
  if (!parsed.success) {
    return NextResponse.json(
      { erro: 'body_invalido', motivos: motivosZod(parsed.error) },
      { status: 400, headers },
    );
  }

  try {
    const unidade = await estoqueUnidadesRepository.criar(parsed.data);
    logger.info(
      'estoque.unidades.criada',
      { usuarioId: auth.id, unidadeId: unidade.id },
      'Unidade serializada criada',
    );
    return NextResponse.json(unidade, { status: 201, headers });
  } catch (e) {
    return respostaDeErro('POST /api/estoque/unidades', { usuarioId: auth.id }, e);
  }
}
