import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { triagemRepository } from '@/infrastructure/repositories';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import {
  reenviarFichaTriagem,
  submeterFichaTriagem,
} from '@/application/use-cases/triagem/submeter-ficha-triagem';
import { CODIGOS_TIPO_DOCUMENTO } from '@/domain/tipo-documento';
import {
  POLITICAS,
  aplicarHeadersRateLimit,
  consumirRateLimit,
  extrairIp,
} from '@/infrastructure/security/rate-limit';
import { respostaDeErro } from '@/app/api/triagem/_helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/app/fichas
 * Submissão de ficha pelo app móvel. Pode incluir `ficha_origem_id` no body
 * pra re-envio após devolução.
 *
 * Headers:
 *   - Idempotency-Key (opcional): UUID v4 do cliente. Se duplicar, devolve a
 *     ficha existente sem criar nova.
 *
 * Auth: sessão de técnico (qualquer usuário autenticado pode submeter).
 * Rate limit: 30/min por usuário, 100/min por IP.
 */

const horaRegex = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
const uuidV4Regex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const corpoSchema = z.object({
  prefixo: z.string().min(1).max(32),
  codTipoDocumento: z
    .number()
    .int()
    .refine((n): n is 1 | 2 | 3 | 4 | 5 | 6 | 7 =>
      (CODIGOS_TIPO_DOCUMENTO as readonly number[]).includes(n),
    ),
  dataVisita: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'data deve ser YYYY-MM-DD'),
  horaInicio: z.string().regex(horaRegex).nullable().optional(),
  horaFim: z.string().regex(horaRegex).nullable().optional(),
  tecnicoNome: z.string().min(1).max(120),
  latitudeCapturada: z.number().min(-90).max(90).nullable().optional(),
  longitudeCapturada: z.number().min(-180).max(180).nullable().optional(),
  precisaoGpsM: z.number().min(0).max(100000).nullable().optional(),
  observacoes: z.string().max(2000).nullable().optional(),
  dados: z.record(z.string(), z.unknown()),
  fichaOrigemId: z.string().regex(uuidV4Regex).nullable().optional(),
});

export async function POST(request: NextRequest) {
  const usuario = await obterUsuarioAtual();
  if (!usuario) {
    return NextResponse.json({ erro: 'nao_autenticado' }, { status: 401 });
  }

  // Rate limit em duas dimensões: usuário (30/min) e IP (100/min).
  const ip = extrairIp(request);
  const rlUser = consumirRateLimit(POLITICAS.submeterFicha, usuario.id);
  const rlIp = consumirRateLimit(POLITICAS.submeterFichaIp, ip);
  const headers = new Headers();
  aplicarHeadersRateLimit(headers, POLITICAS.submeterFicha, rlUser);

  if (!rlUser.permitido || !rlIp.permitido) {
    return NextResponse.json(
      { erro: 'rate_limit', mensagem: 'Muitas requisições. Tente novamente.' },
      { status: 429, headers },
    );
  }

  let corpoBruto: unknown;
  try {
    corpoBruto = await request.json();
  } catch {
    return NextResponse.json(
      { erro: 'json_invalido', mensagem: 'Body deve ser JSON válido.' },
      { status: 400, headers },
    );
  }

  const parseado = corpoSchema.safeParse(corpoBruto);
  if (!parseado.success) {
    return NextResponse.json(
      {
        erro: 'body_invalido',
        motivos: parseado.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      },
      { status: 400, headers },
    );
  }

  const corpo = parseado.data;
  const idempotencyKey = request.headers.get('Idempotency-Key')?.trim() || null;
  if (idempotencyKey && !uuidV4Regex.test(idempotencyKey)) {
    return NextResponse.json(
      { erro: 'idempotency_invalida', mensagem: 'Idempotency-Key deve ser UUID v4.' },
      { status: 400, headers },
    );
  }

  const userAgent = request.headers.get('user-agent');
  const metadata = { ip: ip === 'unknown' ? null : ip, userAgent };

  const entrada = {
    prefixo: corpo.prefixo,
    codTipoDocumento: corpo.codTipoDocumento,
    dataVisita: new Date(`${corpo.dataVisita}T00:00:00Z`),
    horaInicio: corpo.horaInicio ?? null,
    horaFim: corpo.horaFim ?? null,
    tecnicoId: usuario.id,
    tecnicoNome: corpo.tecnicoNome,
    latitudeCapturada: corpo.latitudeCapturada ?? null,
    longitudeCapturada: corpo.longitudeCapturada ?? null,
    precisaoGpsM: corpo.precisaoGpsM ?? null,
    observacoes: corpo.observacoes ?? null,
    dados: corpo.dados,
    origem: 'app_campo' as const,
    idempotencyKey,
  };

  try {
    let ficha;
    if (corpo.fichaOrigemId) {
      ficha = await reenviarFichaTriagem(
        triagemRepository,
        corpo.fichaOrigemId,
        entrada,
        metadata,
      );
    } else {
      ficha = await submeterFichaTriagem(triagemRepository, entrada, metadata);
    }
    return NextResponse.json(
      { id: ficha.id, estado: ficha.estado, criadaEm: ficha.criadaEm },
      { status: 201, headers },
    );
  } catch (e) {
    return respostaDeErro(
      'api app/fichas POST',
      { usuarioId: usuario.id, prefixo: corpo.prefixo },
      e,
    );
  }
}
