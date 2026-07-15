import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { estoqueConferenciasRepository } from '@/infrastructure/repositories';
import { exigirAdmin } from '@/app/api/_helpers/auth';
import { respostaDeErro } from '@/app/api/_helpers/erros';
import { logger } from '@/infrastructure/logging/logger';
import {
  registrarContagem,
  type EntradaContagem,
} from '@/application/use-cases/estoque/registrar-contagem';
import { checarRateLimit } from '../../../../_rl';
import { motivosZod } from '../../../../_schemas';
import { contagemItemSchema } from '../../../_schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const idSchema = z.string().uuid('Identificador inválido.');

/**
 * PATCH /api/estoque/conferencias/[id]/itens/[itemId] — registra a contagem de 1
 * item (so com a sessao aberta). Escrita: admin. Guarda de IDOR: o repositorio
 * valida `id + conferencia_id` juntos (item pertence a conferencia do path).
 * Erros: 404 item; 409 conferencia_fechada; 400 natureza/payload.
 */
export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string; itemId: string }> },
) {
  const auth = await exigirAdmin();
  if (auth instanceof NextResponse) return auth;
  const { headers, resposta } = checarRateLimit('conferenciaEstoque', auth.id);
  if (resposta) return resposta;

  const params = await ctx.params;
  const idParsed = idSchema.safeParse(params.id);
  const itemParsed = idSchema.safeParse(params.itemId);
  if (!idParsed.success || !itemParsed.success) {
    return NextResponse.json({ erro: 'id_invalido' }, { status: 400, headers });
  }

  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ erro: 'json_invalido' }, { status: 400, headers });
  }
  const parsed = contagemItemSchema.safeParse(corpo);
  if (!parsed.success) {
    return NextResponse.json(
      { erro: 'body_invalido', motivos: motivosZod(parsed.error) },
      { status: 400, headers },
    );
  }

  try {
    const item = await registrarContagem(
      estoqueConferenciasRepository,
      idParsed.data,
      itemParsed.data,
      parsed.data as EntradaContagem,
      auth.id,
    );
    logger.info(
      'estoque.conferencias.contagem_registrada',
      { usuarioId: auth.id, conferenciaId: idParsed.data, itemId: item.id },
      'Contagem de item registrada',
    );
    return NextResponse.json(item, { status: 200, headers });
  } catch (e) {
    return respostaDeErro(
      'PATCH /api/estoque/conferencias/[id]/itens/[itemId]',
      { usuarioId: auth.id },
      e,
    );
  }
}
