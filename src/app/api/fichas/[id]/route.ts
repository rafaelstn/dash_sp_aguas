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
import { respostaDeErro } from '@/app/api/_helpers/erros';

export const runtime = 'nodejs';

/**
 * GET /api/fichas/[id], detalhe da ficha. Requer autenticação.
 *
 * Leitura compartilhada por design institucional (SEG-4): qualquer usuário do
 * órgão (allowlist SP Águas) pode ler qualquer ficha, para visão institucional
 * do posto e continuidade de trabalho. A assimetria com a escrita é
 * intencional: edição/exclusão (PATCH/DELETE) seguem restritas a dono ou
 * aprovador. Decisão registrada para não ser reaberta como IDOR em auditoria.
 */
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
    return respostaDeErro('GET /api/fichas/[id]', { id }, e);
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
    // Mantém 422 (Unprocessable Entity) para validação semântica da ficha,
    // contrato já consumido pelo frontend; o helper trataria como 400.
    if (e instanceof DadosFichaInvalidos) {
      return NextResponse.json(
        { erro: 'dados_invalidos', mensagem: e.message, motivos: e.motivos },
        { status: 422 },
      );
    }
    return respostaDeErro('PATCH /api/fichas/[id]', { id }, e);
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
    return respostaDeErro('DELETE /api/fichas/[id]', { id }, e);
  }
}
