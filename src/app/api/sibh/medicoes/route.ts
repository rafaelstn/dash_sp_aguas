import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { exigirUsuario } from '@/app/api/_helpers/auth';
import {
  sibhClient,
  SibhIndisponivelError,
} from '@/infrastructure/sibh/sibh-client';
import { agregarDiario } from '@/application/ports/sibh-gateway';
import { respostaDeErro } from '@/app/api/_helpers/erros';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data deve ser YYYY-MM-DD');

const querySchema = z
  .object({
    prefixo: z.string().trim().min(1).max(40),
    desde: isoDate,
    ate: isoDate,
    /** 'horaria' devolve as medições cruas; 'diaria' agrega por dia hidrológico. */
    agregacao: z.enum(['horaria', 'diaria']).default('horaria'),
  })
  .refine((q) => q.desde <= q.ate, {
    message: 'desde deve ser menor ou igual a ate',
    path: ['desde'],
  });

/**
 * GET /api/sibh/medicoes?prefixo=...&desde=YYYY-MM-DD&ate=YYYY-MM-DD&agregacao=horaria|diaria
 *
 * Medições horárias de chuva de uma estação do SIBH (proxy server-side, sem
 * CORS). Exige sessão. Com `agregacao=diaria`, retorna a soma por dia
 * hidrológico (07:00 -> 06:59).
 */
export async function GET(request: NextRequest) {
  const auth = await exigirUsuario();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    prefixo: searchParams.get('prefixo') ?? undefined,
    desde: searchParams.get('desde') ?? undefined,
    ate: searchParams.get('ate') ?? undefined,
    agregacao: searchParams.get('agregacao') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      {
        erro: 'query_invalida',
        motivos: parsed.error.issues.map(
          (i) => `${i.path.join('.')}: ${i.message}`,
        ),
      },
      { status: 400 },
    );
  }

  const { prefixo, desde, ate, agregacao } = parsed.data;
  // Datas no formato YYYY-MM-DD; usa meio-dia UTC pra não cair no dia anterior
  // por offset de timezone na formatação do adapter.
  const desdeData = new Date(`${desde}T12:00:00Z`);
  const ateData = new Date(`${ate}T12:00:00Z`);

  try {
    const medicoes = await sibhClient.medicoesPorPrefixo(prefixo, desdeData, ateData);

    if (agregacao === 'diaria') {
      const dias = agregarDiario(medicoes);
      return NextResponse.json({ prefixo, agregacao, total: dias.length, itens: dias });
    }

    return NextResponse.json({
      prefixo,
      agregacao,
      total: medicoes.length,
      itens: medicoes,
    });
  } catch (e) {
    if (e instanceof SibhIndisponivelError) {
      return NextResponse.json(
        { erro: 'sibh_indisponivel', mensagem: e.message },
        { status: 502 },
      );
    }
    return respostaDeErro('GET /api/sibh/medicoes', { prefixo }, e);
  }
}
