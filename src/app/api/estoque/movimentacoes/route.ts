import { NextResponse, type NextRequest } from 'next/server';
import {
  estoqueMovimentacoesRepository,
} from '@/infrastructure/repositories';
import { exigirUsuario, exigirAdmin } from '@/app/api/_helpers/auth';
import { respostaDeErro } from '@/app/api/_helpers/erros';
import { logger } from '@/infrastructure/logging/logger';
import { registrarMovimentacao } from '@/application/use-cases/estoque/registrar-movimentacao';
import { checarRateLimit } from '../_rl';
import { movimentacaoSchema, motivosZod, lerPaginacao, tipoMovEnum } from '../_schemas';
import type { FiltrosMovimentacao } from '@/domain/estoque/movimentacao';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/estoque/movimentacoes — trilha de auditoria paginada. Leitura: usuario.
 * Filtros: tipo, unidadeId, materialId, local, usuarioId, de, ate, pagina, porPagina.
 */
export async function GET(request: NextRequest) {
  const auth = await exigirUsuario();
  if (auth instanceof NextResponse) return auth;
  const { headers, resposta } = checarRateLimit('leituraEstoque', auth.id);
  if (resposta) return resposta;

  try {
    const sp = request.nextUrl.searchParams;
    const tipoBruto = sp.get('tipo');
    const tipo = tipoMovEnum.safeParse(tipoBruto).success
      ? (tipoBruto as FiltrosMovimentacao['tipo'])
      : undefined;
    const de = sp.get('de');
    const ate = sp.get('ate');
    const { pagina, porPagina } = lerPaginacao(sp);
    const filtros: FiltrosMovimentacao = {
      tipo,
      unidadeId: sp.get('unidadeId') ?? undefined,
      materialId: sp.get('materialId') ?? undefined,
      localId: sp.get('local') ?? undefined,
      usuarioId: sp.get('usuarioId') ?? undefined,
      de: de && !Number.isNaN(Date.parse(de)) ? new Date(de) : undefined,
      ate: ate && !Number.isNaN(Date.parse(ate)) ? new Date(ate) : undefined,
      pagina,
      porPagina,
    };
    const { itens, total } = await estoqueMovimentacoesRepository.listar(filtros);
    return NextResponse.json({ itens, total, pagina, porPagina }, { status: 200, headers });
  } catch (e) {
    return respostaDeErro('GET /api/estoque/movimentacoes', { usuarioId: auth.id }, e);
  }
}

/**
 * POST /api/estoque/movimentacoes — registra movimentacao (nucleo transacional).
 * Escrita: exigirAdmin. usuario_id do ledger vem SEMPRE do auth (nunca do corpo).
 * Erros de negocio: 409 saldo_insuficiente/transicao_invalida, 404 alvo, 400 payload.
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
  const parsed = movimentacaoSchema.safeParse(corpo);
  if (!parsed.success) {
    return NextResponse.json(
      { erro: 'body_invalido', motivos: motivosZod(parsed.error) },
      { status: 400, headers },
    );
  }
  const d = parsed.data;

  try {
    const resultado = await registrarMovimentacao(
      estoqueMovimentacoesRepository,
      {
        tipo: d.tipo,
        unidadeId: d.unidadeId,
        materialId: d.materialId,
        quantidade: d.quantidade,
        tamanho: 'tamanho' in d ? d.tamanho : undefined,
        localOrigem: 'localOrigem' in d ? d.localOrigem : undefined,
        localDestino: 'localDestino' in d ? d.localDestino : undefined,
        motivo: 'motivo' in d ? d.motivo : undefined,
        estado: 'estado' in d ? d.estado : undefined,
        status: 'status' in d ? d.status : undefined,
      },
      auth.id,
    );

    logger.info(
      'estoque.movimentacoes.registrada',
      {
        usuarioId: auth.id,
        movimentacaoId: resultado.movimentacao.id,
        tipo: resultado.movimentacao.tipo,
        unidadeId: resultado.movimentacao.unidadeId,
        materialId: resultado.movimentacao.materialId,
        quantidade: resultado.movimentacao.quantidade,
      },
      'Movimentacao de estoque registrada',
    );
    return NextResponse.json(resultado, { status: 201, headers });
  } catch (e) {
    return respostaDeErro('POST /api/estoque/movimentacoes', { usuarioId: auth.id }, e);
  }
}
