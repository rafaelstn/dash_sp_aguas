import { NextResponse, type NextRequest } from 'next/server';
import { fichasVisitaRepository } from '@/infrastructure/repositories';
import {
  apagarFichaVisita,
  atualizarFichaVisita,
  DadosFichaInvalidos,
  obterFichaVisita,
} from '@/application/use-cases/fichas-visita';

export const runtime = 'nodejs';

/** GET /api/fichas/[id] — detalhe da ficha. */
export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  try {
    const ficha = await obterFichaVisita(fichasVisitaRepository, id);
    if (!ficha) {
      return NextResponse.json(
        { erro: 'Ficha não encontrada.' },
        { status: 404 },
      );
    }
    return NextResponse.json({ ficha });
  } catch (e) {
    console.error('[api fichas/:id] Falha ao obter', { id, erro: e });
    return NextResponse.json(
      { erro: 'Falha ao consultar ficha.' },
      { status: 500 },
    );
  }
}

interface CorpoEdicao {
  dataVisita?: string;
  horaInicio?: string | null;
  horaFim?: string | null;
  tecnicoNome?: string;
  latitudeCapturada?: number | null;
  longitudeCapturada?: number | null;
  observacoes?: string | null;
  dados?: Record<string, unknown>;
  status?: 'rascunho' | 'enviada' | 'aprovada';
}

/** PATCH /api/fichas/[id] — atualização parcial. */
export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  let corpo: CorpoEdicao;
  try {
    corpo = (await request.json()) as CorpoEdicao;
  } catch {
    return NextResponse.json({ erro: 'JSON inválido.' }, { status: 400 });
  }

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
        { erro: e.message, motivos: e.motivos },
        { status: 422 },
      );
    }
    console.error('[api fichas/:id] Falha ao atualizar', { id, erro: e });
    return NextResponse.json(
      { erro: 'Falha ao atualizar ficha.' },
      { status: 500 },
    );
  }
}

/** DELETE /api/fichas/[id] — hard delete. */
export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  try {
    await apagarFichaVisita(fichasVisitaRepository, id);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    console.error('[api fichas/:id] Falha ao apagar', { id, erro: e });
    return NextResponse.json(
      { erro: 'Falha ao apagar ficha.' },
      { status: 500 },
    );
  }
}
