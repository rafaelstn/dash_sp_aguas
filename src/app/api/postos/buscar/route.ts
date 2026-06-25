import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { exigirUsuario } from '@/app/api/_helpers/auth';
import { autocompletarPostos } from '@/application/use-cases/autocompletar-postos';
import { postosRepository } from '@/infrastructure/repositories';
import { respostaDeErro } from '@/app/api/_helpers/erros';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const querySchema = z.object({
  q: z.string().trim().max(60).optional(),
  limite: z.coerce.number().int().min(1).max(50).optional(),
});

/**
 * GET /api/postos/buscar?q=<termo>&limite=<n>
 *
 * Autocomplete de postos para vincular um nó do diagrama a um posto do
 * catálogo. Retorno enxuto (prefixo, nome, tipo, prefixo ANA). Exige sessão.
 *
 * Difere de `/api/postos/search` (paginado, item completo, COUNT total): aqui
 * o foco é digitação rápida com payload mínimo. Termo com menos de 2
 * caracteres devolve lista vazia, sem erro.
 */
export async function GET(request: NextRequest) {
  const auth = await exigirUsuario();
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    q: searchParams.get('q') ?? undefined,
    limite: searchParams.get('limite') ?? undefined,
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

  try {
    const itens = await autocompletarPostos(postosRepository, {
      termo: parsed.data.q,
      limite: parsed.data.limite,
    });
    return NextResponse.json({ total: itens.length, itens });
  } catch (e) {
    return respostaDeErro('GET /api/postos/buscar', { q: parsed.data.q }, e);
  }
}
