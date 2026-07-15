import { NextResponse, type NextRequest } from 'next/server';
import { estoqueConferenciasRepository } from '@/infrastructure/repositories';
import { exigirUsuario, exigirAdmin } from '@/app/api/_helpers/auth';
import { respostaDeErro } from '@/app/api/_helpers/erros';
import { logger } from '@/infrastructure/logging/logger';
import { abrirConferencia } from '@/application/use-cases/estoque/abrir-conferencia';
import type { FiltrosConferencia } from '@/domain/estoque/conferencia';
import { checarRateLimit } from '../_rl';
import { lerPaginacao, motivosZod, naturezaEnum, unidadeFisicaEnum } from '../_schemas';
import { abrirConferenciaSchema } from './_schemas';
import { ehStatusConferencia } from '@/domain/estoque/conferencia';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/estoque/conferencias — lista sessoes de conferencia (paginado).
 * Leitura: exigirUsuario. Filtros: unidade, natureza, status, pagina, porPagina.
 */
export async function GET(request: NextRequest) {
  const auth = await exigirUsuario();
  if (auth instanceof NextResponse) return auth;
  const { headers, resposta } = checarRateLimit('leituraEstoque', auth.id);
  if (resposta) return resposta;

  try {
    const sp = request.nextUrl.searchParams;
    const unidadeBruta = sp.get('unidade');
    const naturezaBruta = sp.get('natureza');
    const statusBruto = sp.get('status');
    const { pagina, porPagina } = lerPaginacao(sp);
    const filtros: FiltrosConferencia = {
      unidade: unidadeFisicaEnum.safeParse(unidadeBruta).success
        ? (unidadeBruta as FiltrosConferencia['unidade'])
        : undefined,
      natureza: naturezaEnum.safeParse(naturezaBruta).success
        ? (naturezaBruta as FiltrosConferencia['natureza'])
        : undefined,
      status: ehStatusConferencia(statusBruto)
        ? (statusBruto as FiltrosConferencia['status'])
        : undefined,
      pagina,
      porPagina,
    };
    const { itens, total } = await estoqueConferenciasRepository.listar(filtros);
    return NextResponse.json({ itens, total, pagina, porPagina }, { status: 200, headers });
  } catch (e) {
    return respostaDeErro('GET /api/estoque/conferencias', { usuarioId: auth.id }, e);
  }
}

/**
 * POST /api/estoque/conferencias — abre sessao + SNAPSHOT congelado (transacional).
 * Escrita: exigirAdmin. `criada_por` vem SEMPRE do auth (nunca do corpo).
 * Erros: 409 escopo_conferencia_em_aberto; 400 payload.
 */
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
  const parsed = abrirConferenciaSchema.safeParse(corpo);
  if (!parsed.success) {
    return NextResponse.json(
      { erro: 'body_invalido', motivos: motivosZod(parsed.error) },
      { status: 400, headers },
    );
  }
  const d = parsed.data;

  try {
    const conferencia = await abrirConferencia(
      estoqueConferenciasRepository,
      { unidade: d.unidade, natureza: d.natureza, localId: d.localId, observacao: d.observacao },
      auth.id,
    );
    logger.info(
      'estoque.conferencias.aberta',
      {
        usuarioId: auth.id,
        conferenciaId: conferencia.id,
        unidade: conferencia.unidade,
        natureza: conferencia.natureza,
        localId: conferencia.localId,
      },
      'Conferencia fisica aberta (snapshot congelado)',
    );
    return NextResponse.json(conferencia, { status: 201, headers });
  } catch (e) {
    return respostaDeErro('POST /api/estoque/conferencias', { usuarioId: auth.id }, e);
  }
}
