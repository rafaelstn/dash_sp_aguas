import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { estoqueConferenciasRepository } from '@/infrastructure/repositories';
import { exigirUsuario, exigirAdmin } from '@/app/api/_helpers/auth';
import { respostaDeErro } from '@/app/api/_helpers/erros';
import { ConferenciaNaoEncontrada } from '@/domain/errors';
import { logger } from '@/infrastructure/logging/logger';
import { concluirConferencia } from '@/application/use-cases/estoque/concluir-conferencia';
import { checarRateLimit } from '../../_rl';
import { motivosZod } from '../../_schemas';
import { acaoConferenciaSchema } from '../_schemas';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const idSchema = z.string().uuid('Identificador de conferência inválido.');

/** GET /api/estoque/conferencias/[id] — detalhe + resumo de divergencias. Leitura: usuario. */
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await exigirUsuario();
  if (auth instanceof NextResponse) return auth;
  const { headers, resposta } = checarRateLimit('leituraEstoque', auth.id);
  if (resposta) return resposta;

  const idParsed = idSchema.safeParse((await ctx.params).id);
  if (!idParsed.success) return NextResponse.json({ erro: 'id_invalido' }, { status: 400, headers });

  try {
    const conferencia = await estoqueConferenciasRepository.obterPorId(idParsed.data);
    if (!conferencia) throw new ConferenciaNaoEncontrada(idParsed.data);
    const resumo = await estoqueConferenciasRepository.resumoDivergencias(idParsed.data);
    return NextResponse.json({ conferencia, resumo }, { status: 200, headers });
  } catch (e) {
    return respostaDeErro('GET /api/estoque/conferencias/[id]', { usuarioId: auth.id }, e);
  }
}

/**
 * PATCH /api/estoque/conferencias/[id] — conclui ou cancela a sessao. Escrita: admin.
 * `concluida_por` vem do auth. Erros: 404 nao encontrada; 409 conferencia_fechada.
 */
export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
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
  const parsed = acaoConferenciaSchema.safeParse(corpo);
  if (!parsed.success) {
    return NextResponse.json(
      { erro: 'body_invalido', motivos: motivosZod(parsed.error) },
      { status: 400, headers },
    );
  }

  try {
    const conferencia = await concluirConferencia(
      estoqueConferenciasRepository,
      idParsed.data,
      parsed.data.acao,
      auth.id,
      parsed.data.observacao ?? null,
    );
    logger.info(
      'estoque.conferencias.transicao',
      { usuarioId: auth.id, conferenciaId: conferencia.id, acao: parsed.data.acao, status: conferencia.status },
      'Conferencia fisica concluida/cancelada',
    );
    return NextResponse.json(conferencia, { status: 200, headers });
  } catch (e) {
    return respostaDeErro('PATCH /api/estoque/conferencias/[id]', { usuarioId: auth.id }, e);
  }
}
