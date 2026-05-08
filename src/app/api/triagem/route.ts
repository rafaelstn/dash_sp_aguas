import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  papeisRepository,
  triagemRepository,
} from '@/infrastructure/repositories';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import { listarTriagemPendentes } from '@/application/use-cases/triagem/listar-triagem-pendentes';
import { CODIGOS_TIPO_DOCUMENTO } from '@/domain/tipo-documento';
import {
  POLITICAS,
  aplicarHeadersRateLimit,
  consumirRateLimit,
} from '@/infrastructure/security/rate-limit';
import { respostaDeErro } from './_helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  codTipoDocumento: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : undefined))
    .refine(
      (n) =>
        n === undefined ||
        (Number.isInteger(n) &&
          (CODIGOS_TIPO_DOCUMENTO as readonly number[]).includes(n)),
      { message: 'codTipoDocumento inválido' },
    ),
  prefixo: z.string().min(1).max(32).optional(),
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  ate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limite: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

/**
 * GET /api/triagem
 * Lista fichas pendentes/em revisão. Exige papel de aprovador.
 */
export async function GET(request: NextRequest) {
  const usuario = await obterUsuarioAtual();
  if (!usuario) {
    return NextResponse.json({ erro: 'nao_autenticado' }, { status: 401 });
  }

  const rl = consumirRateLimit(POLITICAS.leituraTriagem, usuario.id);
  const headers = new Headers();
  aplicarHeadersRateLimit(headers, POLITICAS.leituraTriagem, rl);
  if (!rl.permitido) {
    return NextResponse.json(
      { erro: 'rate_limit' },
      { status: 429, headers },
    );
  }

  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams.entries());
  const parseado = querySchema.safeParse(params);
  if (!parseado.success) {
    return NextResponse.json(
      {
        erro: 'query_invalida',
        motivos: parseado.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      },
      { status: 400, headers },
    );
  }
  const q = parseado.data;

  try {
    const resultado = await listarTriagemPendentes(
      triagemRepository,
      papeisRepository,
      usuario.id,
      {
        codTipoDocumento: q.codTipoDocumento as 1 | 2 | 3 | 4 | 5 | 6 | 7 | undefined,
        prefixo: q.prefixo,
        desde: q.desde ? new Date(`${q.desde}T00:00:00Z`) : undefined,
        ate: q.ate ? new Date(`${q.ate}T23:59:59Z`) : undefined,
        limite: q.limite,
        offset: q.offset,
      },
    );
    return NextResponse.json(resultado, { headers });
  } catch (e) {
    return respostaDeErro(
      'api triagem GET',
      { usuarioId: usuario.id },
      e,
    );
  }
}
