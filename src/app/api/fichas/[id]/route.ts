import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { fichasVisitaRepository } from '@/infrastructure/repositories';
import {
  apagarFichaVisita,
  atualizarFichaVisita,
  DadosFichaInvalidos,
  obterFichaVisita,
} from '@/application/use-cases/fichas-visita';
import { exigirUsuario, permitirDonoOuAprovador } from '@/app/api/_helpers/auth';
import { logger } from '@/infrastructure/logging/logger';
import { randomUUID } from 'node:crypto';

export const runtime = 'nodejs';

/** GET /api/fichas/[id], detalhe da ficha. Requer autenticação. */
export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await exigirUsuario();
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  try {
    const ficha = await obterFichaVisita(fichasVisitaRepository, id);
    if (!ficha) {
      return NextResponse.json(
        { erro: 'nao_encontrada', mensagem: 'Ficha não encontrada.' },
        { status: 404 },
      );
    }
    return NextResponse.json({ ficha });
  } catch (e) {
    const correlationId = randomUUID();
    logger.error(
      'erro_inesperado',
      { correlationId, rota: 'GET /api/fichas/[id]', id, erro: String(e) },
      'Falha ao obter ficha',
    );
    return NextResponse.json(
      { erro: 'erro_interno', mensagem: 'Falha ao consultar ficha.', correlationId },
      { status: 500 },
    );
  }
}

const corpoEdicaoSchema = z.object({
  dataVisita: z.string().min(1).optional(),
  horaInicio: z.string().nullable().optional(),
  horaFim: z.string().nullable().optional(),
  tecnicoNome: z.string().max(200).optional(),
  latitudeCapturada: z.number().min(-90).max(90).nullable().optional(),
  longitudeCapturada: z.number().min(-180).max(180).nullable().optional(),
  observacoes: z.string().max(5000).nullable().optional(),
  dados: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(['rascunho', 'enviada', 'aprovada']).optional(),
});

type CorpoEdicao = z.infer<typeof corpoEdicaoSchema>;

/**
 * PATCH /api/fichas/[id], atualização parcial. Requer autenticação e que
 * o usuário seja o autor da ficha (campo tecnicoId) ou tenha papel de
 * aprovador. Bloqueia IDOR entre técnicos.
 */
export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await exigirUsuario();
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;

  const fichaExistente = await fichasVisitaRepository.obterPorId(id);
  if (!fichaExistente) {
    return NextResponse.json(
      { erro: 'nao_encontrada', mensagem: 'Ficha não encontrada.' },
      { status: 404 },
    );
  }
  const permissao = await permitirDonoOuAprovador(auth, fichaExistente.tecnicoId);
  if (permissao !== true) return permissao;

  let bruto: unknown;
  try {
    bruto = await request.json();
  } catch {
    return NextResponse.json(
      { erro: 'corpo_invalido', mensagem: 'JSON inválido.' },
      { status: 400 },
    );
  }

  const parsed = corpoEdicaoSchema.safeParse(bruto);
  if (!parsed.success) {
    return NextResponse.json(
      {
        erro: 'dados_invalidos',
        mensagem: 'Corpo da requisição inválido.',
        motivos: parsed.error.issues.map(
          (i) => `${i.path.join('.')}: ${i.message}`,
        ),
      },
      { status: 422 },
    );
  }
  const corpo: CorpoEdicao = parsed.data;

  try {
    const atualizada = await atualizarFichaVisita(fichasVisitaRepository, id, {
      ...(corpo.dataVisita && { dataVisita: new Date(corpo.dataVisita) }),
      ...(corpo.horaInicio !== undefined && { horaInicio: corpo.horaInicio }),
      ...(corpo.horaFim !== undefined && { horaFim: corpo.horaFim }),
      ...(corpo.tecnicoNome !== undefined && { tecnicoNome: corpo.tecnicoNome }),
      ...(corpo.latitudeCapturada !== undefined && {
        latitudeCapturada: corpo.latitudeCapturada,
      }),
      ...(corpo.longitudeCapturada !== undefined && {
        longitudeCapturada: corpo.longitudeCapturada,
      }),
      ...(corpo.observacoes !== undefined && { observacoes: corpo.observacoes }),
      ...(corpo.dados !== undefined && { dados: corpo.dados }),
      ...(corpo.status !== undefined && { status: corpo.status }),
    });
    return NextResponse.json({ ficha: atualizada });
  } catch (e) {
    if (e instanceof DadosFichaInvalidos) {
      return NextResponse.json(
        { erro: 'dados_invalidos', mensagem: e.message, motivos: e.motivos },
        { status: 422 },
      );
    }
    const correlationId = randomUUID();
    logger.error(
      'erro_inesperado',
      { correlationId, rota: 'PATCH /api/fichas/[id]', id, erro: String(e) },
      'Falha ao atualizar ficha',
    );
    return NextResponse.json(
      { erro: 'erro_interno', mensagem: 'Falha ao atualizar ficha.', correlationId },
      { status: 500 },
    );
  }
}

/** DELETE /api/fichas/[id], hard delete. Mesma autorização do PATCH. */
export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await exigirUsuario();
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;

  const fichaExistente = await fichasVisitaRepository.obterPorId(id);
  if (!fichaExistente) {
    return NextResponse.json(
      { erro: 'nao_encontrada', mensagem: 'Ficha não encontrada.' },
      { status: 404 },
    );
  }
  const permissao = await permitirDonoOuAprovador(auth, fichaExistente.tecnicoId);
  if (permissao !== true) return permissao;

  try {
    await apagarFichaVisita(fichasVisitaRepository, id);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    const correlationId = randomUUID();
    logger.error(
      'erro_inesperado',
      { correlationId, rota: 'DELETE /api/fichas/[id]', id, erro: String(e) },
      'Falha ao apagar ficha',
    );
    return NextResponse.json(
      { erro: 'erro_interno', mensagem: 'Falha ao apagar ficha.', correlationId },
      { status: 500 },
    );
  }
}
