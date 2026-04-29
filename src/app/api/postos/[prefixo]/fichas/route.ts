import { NextResponse, type NextRequest } from 'next/server';
import { fichasVisitaRepository } from '@/infrastructure/repositories';
import {
  criarFichaVisita,
  DadosFichaInvalidos,
  listarFichasDoPosto,
  TipoFichaIndisponivel,
} from '@/application/use-cases/fichas-visita';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import type { CodigoTipoDocumento } from '@/domain/tipo-documento';

export const runtime = 'nodejs';

/**
 * GET /api/postos/[prefixo]/fichas[?tipo=N]
 * Lista as fichas digitais do posto. Filtro opcional por tipo de documento.
 */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ prefixo: string }> },
) {
  const { prefixo: prefixoRaw } = await ctx.params;
  const prefixo = decodeURIComponent(prefixoRaw);

  const tipoParam = request.nextUrl.searchParams.get('tipo');
  const tipo = tipoParam ? Number(tipoParam) : undefined;
  const tipoValidado =
    tipo && tipo >= 1 && tipo <= 7 ? (tipo as CodigoTipoDocumento) : undefined;

  try {
    const fichas = await listarFichasDoPosto(
      fichasVisitaRepository,
      prefixo,
      tipoValidado,
    );
    return NextResponse.json({ fichas });
  } catch (e) {
    console.error('[api fichas] Falha ao listar', { prefixo, erro: e });
    return NextResponse.json(
      { erro: 'Falha ao listar fichas do posto.' },
      { status: 500 },
    );
  }
}

interface CorpoCriacao {
  codTipoDocumento: number;
  dataVisita: string;
  horaInicio?: string | null;
  horaFim?: string | null;
  tecnicoNome: string;
  latitudeCapturada?: number | null;
  longitudeCapturada?: number | null;
  observacoes?: string | null;
  dados: Record<string, unknown>;
  origem?: 'web_simulada' | 'app_campo' | 'importacao';
  status?: 'rascunho' | 'enviada' | 'aprovada';
}

/**
 * POST /api/postos/[prefixo]/fichas
 * Cria uma ficha digital pro posto. Valida payload via Zod (use case).
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ prefixo: string }> },
) {
  const { prefixo: prefixoRaw } = await ctx.params;
  const prefixo = decodeURIComponent(prefixoRaw);

  let corpo: CorpoCriacao;
  try {
    corpo = (await request.json()) as CorpoCriacao;
  } catch {
    return NextResponse.json({ erro: 'JSON inválido.' }, { status: 400 });
  }

  if (!corpo.tecnicoNome?.trim()) {
    return NextResponse.json(
      { erro: 'tecnicoNome é obrigatório.' },
      { status: 400 },
    );
  }
  if (!corpo.dataVisita) {
    return NextResponse.json(
      { erro: 'dataVisita é obrigatória.' },
      { status: 400 },
    );
  }

  const usuario = await obterUsuarioAtual();

  try {
    const ficha = await criarFichaVisita(fichasVisitaRepository, {
      prefixo,
      codTipoDocumento: corpo.codTipoDocumento as CodigoTipoDocumento,
      dataVisita: new Date(corpo.dataVisita),
      horaInicio: corpo.horaInicio ?? null,
      horaFim: corpo.horaFim ?? null,
      tecnicoNome: corpo.tecnicoNome.trim(),
      tecnicoId: usuario?.id ?? null,
      latitudeCapturada: corpo.latitudeCapturada ?? null,
      longitudeCapturada: corpo.longitudeCapturada ?? null,
      observacoes: corpo.observacoes ?? null,
      dados: corpo.dados ?? {},
      origem: corpo.origem,
      status: corpo.status,
    });
    return NextResponse.json({ ficha }, { status: 201 });
  } catch (e) {
    if (e instanceof TipoFichaIndisponivel) {
      return NextResponse.json({ erro: e.message }, { status: 400 });
    }
    if (e instanceof DadosFichaInvalidos) {
      return NextResponse.json(
        { erro: e.message, motivos: e.motivos },
        { status: 422 },
      );
    }
    console.error('[api fichas] Falha ao criar', { prefixo, erro: e });
    return NextResponse.json(
      { erro: 'Falha ao criar ficha. Tente novamente.' },
      { status: 500 },
    );
  }
}
