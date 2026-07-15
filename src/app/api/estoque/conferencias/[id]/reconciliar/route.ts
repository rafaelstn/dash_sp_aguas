import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { estoqueConferenciasRepository } from '@/infrastructure/repositories';
import { exigirAdmin } from '@/app/api/_helpers/auth';
import { respostaDeErro } from '@/app/api/_helpers/erros';
import { logger } from '@/infrastructure/logging/logger';
import { reconciliarLote } from '@/application/use-cases/estoque/reconciliar-conferencia';
import { checarRateLimit } from '../../../_rl';
import { motivosZod } from '../../../_schemas';
import { reconciliarLoteSchema } from '../../_schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const idSchema = z.string().uuid('Identificador de conferência inválido.');

/**
 * POST /api/estoque/conferencias/[id]/reconciliar — reconcilia em LOTE os itens
 * revisados. Escrita: admin. Cada item e atomico + idempotente; um item ruim NAO
 * derruba os demais (partial success reportado por item). So com a sessao
 * concluida (409 antes de iterar). Toca o estoque -> `movimentacaoEstoque`.
 */
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await exigirAdmin();
  if (auth instanceof NextResponse) return auth;
  const { headers, resposta } = checarRateLimit('movimentacaoEstoque', auth.id);
  if (resposta) return resposta;

  const idParsed = idSchema.safeParse((await ctx.params).id);
  if (!idParsed.success) return NextResponse.json({ erro: 'id_invalido' }, { status: 400, headers });

  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ erro: 'json_invalido' }, { status: 400, headers });
  }
  const parsed = reconciliarLoteSchema.safeParse(corpo);
  if (!parsed.success) {
    return NextResponse.json(
      { erro: 'body_invalido', motivos: motivosZod(parsed.error) },
      { status: 400, headers },
    );
  }

  try {
    const resultado = await reconciliarLote(
      estoqueConferenciasRepository,
      idParsed.data,
      parsed.data.itemIds,
      auth.id,
    );
    logger.info(
      'estoque.conferencias.reconciliada_lote',
      {
        usuarioId: auth.id,
        conferenciaId: idParsed.data,
        total: resultado.total,
        reconciliados: resultado.reconciliados,
        falhas: resultado.falhas,
      },
      'Lote de reconciliacao processado',
    );
    return NextResponse.json(resultado, { status: 200, headers });
  } catch (e) {
    return respostaDeErro('POST /api/estoque/conferencias/[id]/reconciliar', { usuarioId: auth.id }, e);
  }
}
