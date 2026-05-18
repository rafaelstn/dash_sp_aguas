import { NextResponse, type NextRequest } from 'next/server';
import { fichasVisitaRepository } from '@/infrastructure/repositories';
import {
  criarFichaVisita,
  DadosFichaInvalidos,
  listarFichasDoPosto,
  TipoFichaIndisponivel,
} from '@/application/use-cases/fichas-visita';
import { exigirUsuario } from '@/app/api/_helpers/auth';
import { logger } from '@/infrastructure/logging/logger';
import { randomUUID } from 'node:crypto';
import type { CodigoTipoDocumento } from '@/domain/tipo-documento';

export const runtime = 'nodejs';

/**
 * GET /api/postos/[prefixo]/fichas[?tipo=N]
 * Lista as fichas digitais do posto. Filtro opcional por tipo de documento.
 * Requer autenticação.
 */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ prefixo: string }> },
) {
  const auth = await exigirUsuario();
  if (auth instanceof NextResponse) return auth;

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
    const correlationId = randomUUID();
    logger.error(
      'erro_inesperado',
      { correlationId, rota: 'GET /api/postos/[prefixo]/fichas', prefixo, erro: String(e) },
      'Falha ao listar fichas do posto',
    );
    return NextResponse.json(
      { erro: 'erro_interno', mensagem: 'Falha ao listar fichas do posto.', correlationId },
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
 * Cria uma ficha digital pro posto. Requer autenticação. O tecnicoId é
 * fixado a partir da sessão (corpo da requisição não pode forjar autoria).
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ prefixo: string }> },
) {
  const auth = await exigirUsuario();
  if (auth instanceof NextResponse) return auth;

  const { prefixo: prefixoRaw } = await ctx.params;
  const prefixo = decodeURIComponent(prefixoRaw);

  let corpo: CorpoCriacao;
  try {
    corpo = (await request.json()) as CorpoCriacao;
  } catch {
    return NextResponse.json(
      { erro: 'corpo_invalido', mensagem: 'JSON inválido.' },
      { status: 400 },
    );
  }

  if (!corpo.tecnicoNome?.trim()) {
    return NextResponse.json(
      { erro: 'campo_obrigatorio', mensagem: 'tecnicoNome é obrigatório.' },
      { status: 400 },
    );
  }
  if (!corpo.dataVisita) {
    return NextResponse.json(
      { erro: 'campo_obrigatorio', mensagem: 'dataVisita é obrigatória.' },
      { status: 400 },
    );
  }

  try {
    const ficha = await criarFichaVisita(fichasVisitaRepository, {
      prefixo,
      codTipoDocumento: corpo.codTipoDocumento as CodigoTipoDocumento,
      dataVisita: new Date(corpo.dataVisita),
      horaInicio: corpo.horaInicio ?? null,
      horaFim: corpo.horaFim ?? null,
      tecnicoNome: corpo.tecnicoNome.trim(),
      tecnicoId: auth.id,
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
      return NextResponse.json(
        { erro: 'tipo_indisponivel', mensagem: e.message },
        { status: 400 },
      );
    }
    if (e instanceof DadosFichaInvalidos) {
      return NextResponse.json(
        { erro: 'dados_invalidos', mensagem: e.message, motivos: e.motivos },
        { status: 422 },
      );
    }
    const correlationId = randomUUID();
    logger.error(
      'erro_inesperado',
      { correlationId, rota: 'POST /api/postos/[prefixo]/fichas', prefixo, erro: String(e) },
      'Falha ao criar ficha',
    );
    return NextResponse.json(
      { erro: 'erro_interno', mensagem: 'Falha ao criar ficha.', correlationId },
      { status: 500 },
    );
  }
}
