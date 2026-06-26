import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { exigirUsuario } from '@/app/api/_helpers/auth';
import { sibhClient } from '@/infrastructure/sibh/sibh-client';
import { obterValoresAoVivo } from '@/application/use-cases/diagramas/valores-ao-vivo';
import { respostaDeErro } from '@/app/api/_helpers/erros';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/diagramas/valores
 * Body: { prefixos: string[] }
 *
 * Leitura ao vivo (modo "AGORA") dos postos vinculados de um diagrama, em lote
 * para evitar uma requisição por elemento. Proxy server-side (sem CORS); exige
 * sessão. Resposta 200: { valores: { [prefixo]: LeituraSibh | null } } — null
 * quando o posto não tem leitura recente ou o SIBH falhou só para aquele.
 */
const bodySchema = z.object({
  prefixos: z.array(z.string().trim().min(1).max(40)).min(1).max(200),
});

export async function POST(request: NextRequest) {
  const auth = await exigirUsuario();
  if (auth instanceof NextResponse) return auth;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ erro: 'json_invalido' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        erro: 'body_invalido',
        motivos: parsed.error.issues.map(
          (i) => `${i.path.join('.')}: ${i.message}`,
        ),
      },
      { status: 400 },
    );
  }

  try {
    const valores = await obterValoresAoVivo(sibhClient, parsed.data.prefixos);
    return NextResponse.json({ valores });
  } catch (e) {
    return respostaDeErro(
      'POST /api/diagramas/valores',
      { total: parsed.data.prefixos.length },
      e,
    );
  }
}
