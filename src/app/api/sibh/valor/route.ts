import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { exigirUsuario } from '@/app/api/_helpers/auth';
import {
  sibhClient,
  SibhIndisponivelError,
} from '@/infrastructure/sibh/sibh-client';
import { respostaDeErro } from '@/app/api/_helpers/erros';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  prefixo: z.string().trim().min(1).max(40),
});

/**
 * GET /api/sibh/valor?prefixo=<cod>
 *
 * Retorna a leitura mais recente do SIBH para o "ao vivo" dos Diagramas:
 * chuva (mm) em estação pluviométrica e/ou nível (m) em estação fluviométrica.
 * Proxy server-side (sem CORS). Exige sessão.
 *
 * Resposta 200:
 *   { prefixo, nome, tipoEstacao, valorMm, valorNivel, momento, gapMinutos }
 *
 * Resposta 404 quando o prefixo não existe no SIBH ou não há medição recente.
 */
export async function GET(request: NextRequest) {
  const auth = await exigirUsuario();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    prefixo: searchParams.get('prefixo') ?? undefined,
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

  const { prefixo } = parsed.data;

  try {
    const leitura = await sibhClient.valorAtualPorPrefixo(prefixo);
    if (!leitura) {
      return NextResponse.json(
        {
          erro: 'sem_leitura',
          mensagem: 'Sem leitura recente do SIBH para este posto.',
        },
        { status: 404 },
      );
    }
    return NextResponse.json(leitura);
  } catch (e) {
    if (e instanceof SibhIndisponivelError) {
      return NextResponse.json(
        { erro: 'sibh_indisponivel', mensagem: e.message },
        { status: 502 },
      );
    }
    return respostaDeErro('GET /api/sibh/valor', { prefixo }, e);
  }
}
