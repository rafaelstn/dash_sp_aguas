import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { estoqueConferenciasRepository } from '@/infrastructure/repositories';
import { exigirAdmin } from '@/app/api/_helpers/auth';
import { respostaDeErro } from '@/app/api/_helpers/erros';
import { logger } from '@/infrastructure/logging/logger';
import { reconciliarItem } from '@/application/use-cases/estoque/reconciliar-conferencia';
import { checarRateLimit } from '../../../../../_rl';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const idSchema = z.string().uuid('Identificador inválido.');

/**
 * POST /api/estoque/conferencias/[id]/itens/[itemId]/reconciliar — reconcilia 1
 * item (so com a sessao concluida). Escrita: admin. ATOMICO + IDEMPOTENTE: item
 * ja reconciliado retorna 200 com o resultado existente (nao gera 2a movimentacao).
 * Toca o estoque real -> politica `movimentacaoEstoque`. Guarda de IDOR no repo.
 */
export async function POST(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string; itemId: string }> },
) {
  const auth = await exigirAdmin();
  if (auth instanceof NextResponse) return auth;
  const { headers, resposta } = checarRateLimit('movimentacaoEstoque', auth.id);
  if (resposta) return resposta;

  const params = await ctx.params;
  const idParsed = idSchema.safeParse(params.id);
  const itemParsed = idSchema.safeParse(params.itemId);
  if (!idParsed.success || !itemParsed.success) {
    return NextResponse.json({ erro: 'id_invalido' }, { status: 400, headers });
  }

  try {
    const resultado = await reconciliarItem(
      estoqueConferenciasRepository,
      idParsed.data,
      itemParsed.data,
      auth.id,
    );
    logger.info(
      'estoque.conferencias.reconciliada',
      {
        usuarioId: auth.id,
        conferenciaId: idParsed.data,
        itemId: resultado.item.id,
        movimentacaoId: resultado.movimentacaoId,
        aviso: resultado.aviso,
        jaReconciliado: resultado.jaReconciliado,
      },
      'Item de conferencia reconciliado',
    );
    return NextResponse.json(resultado, { status: 200, headers });
  } catch (e) {
    return respostaDeErro(
      'POST /api/estoque/conferencias/[id]/itens/[itemId]/reconciliar',
      { usuarioId: auth.id },
      e,
    );
  }
}
