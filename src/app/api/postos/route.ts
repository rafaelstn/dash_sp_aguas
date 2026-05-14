import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  postosRepository,
  papeisRepository,
} from '@/infrastructure/repositories';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import {
  POLITICAS,
  aplicarHeadersRateLimit,
  consumirRateLimit,
  extrairIp,
} from '@/infrastructure/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const corpoSchema = z.object({
  /** Identificação obrigatória do posto. */
  prefixo: z.string().min(1).max(40),
  prefixoAna: z.string().max(40).nullable().optional(),
  nomeEstacao: z.string().max(200).nullable().optional(),
  mantenedor: z.string().max(200).nullable().optional(),
  tipoPosto: z.string().max(20).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  municipio: z.string().max(120).nullable().optional(),
  baciaHidrografica: z.string().max(120).nullable().optional(),
  ugrhiNome: z.string().max(120).nullable().optional(),
  ugrhiNumero: z.string().max(20).nullable().optional(),
  subUgrhiNome: z.string().max(120).nullable().optional(),
  rede: z.string().max(120).nullable().optional(),
  proprietario: z.string().max(120).nullable().optional(),
  altimetria: z.number().nullable().optional(),
  aquifero: z.string().max(120).nullable().optional(),
  observacoes: z.string().max(2000).nullable().optional(),
  operacaoInicioAno: z.number().int().min(1900).max(2100).nullable().optional(),
  operacaoFimAno: z.number().int().min(0).max(2100).nullable().optional(),
  anaEscalaInicio: isoDate.nullable().optional(),
  anaEscalaFim: isoDate.nullable().optional(),
  anaDescargaLiquidaInicio: isoDate.nullable().optional(),
  anaDescargaLiquidaFim: isoDate.nullable().optional(),
  anaSedimentosInicio: isoDate.nullable().optional(),
  anaSedimentosFim: isoDate.nullable().optional(),
  anaQualidadeInicio: isoDate.nullable().optional(),
  anaQualidadeFim: isoDate.nullable().optional(),
  anaPluviometroInicio: isoDate.nullable().optional(),
  anaPluviometroFim: isoDate.nullable().optional(),
  anaTelemetriaInicio: isoDate.nullable().optional(),
  anaTelemetriaFim: isoDate.nullable().optional(),
  origem: z.string().max(60).optional(),
});

/**
 * POST /api/postos
 *
 * Cria posto novo. Usado quando uma estação ANA não tem match em postos
 * e Marcio decide cadastrar (botão "Cadastrar como posto novo" na tela
 * de detalhe ANA).
 *
 * Acesso restrito ao papel `aprovador`. Audit em postos_evento.
 */
export async function POST(request: NextRequest) {
  const usuario = await obterUsuarioAtual();
  if (!usuario) {
    return NextResponse.json({ erro: 'nao_autenticado' }, { status: 401 });
  }
  const ehAprovador = await papeisRepository.ehAprovador(usuario.id);
  if (!ehAprovador) {
    return NextResponse.json({ erro: 'sem_papel_aprovador' }, { status: 403 });
  }

  const rl = consumirRateLimit(POLITICAS.decisaoInventarioAna, usuario.id);
  const headers = new Headers();
  aplicarHeadersRateLimit(headers, POLITICAS.decisaoInventarioAna, rl);
  if (!rl.permitido) {
    return NextResponse.json(
      { erro: 'rate_limit' },
      { status: 429, headers },
    );
  }

  let bruto: unknown;
  try {
    bruto = await request.json();
  } catch {
    return NextResponse.json(
      { erro: 'json_invalido' },
      { status: 400, headers },
    );
  }
  const parsed = corpoSchema.safeParse(bruto);
  if (!parsed.success) {
    return NextResponse.json(
      {
        erro: 'body_invalido',
        motivos: parsed.error.issues.map(
          (i) => `${i.path.join('.')}: ${i.message}`,
        ),
      },
      { status: 400, headers },
    );
  }

  const ip = extrairIp(request);
  try {
    const posto = await postosRepository.criar(parsed.data, {
      usuarioId: usuario.id,
      ip: ip === 'unknown' ? null : ip,
      userAgent: request.headers.get('user-agent'),
      origemEvento: parsed.data.origem ?? 'ana_promocao_manual',
      observacao: 'Posto criado via API (decisão manual)',
    });
    return NextResponse.json({ posto }, { status: 201, headers });
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : 'Falha ao criar posto.';
    if (mensagem.includes('ja existe')) {
      return NextResponse.json(
        { erro: 'prefixo_duplicado', mensagem },
        { status: 409, headers },
      );
    }
    return NextResponse.json(
      { erro: 'falha_criacao', mensagem },
      { status: 500, headers },
    );
  }
}
