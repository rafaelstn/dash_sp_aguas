import { NextResponse } from 'next/server';
import { exigirUsuario } from '@/app/api/_helpers/auth';
import { sibhClient, SibhIndisponivelError } from '@/infrastructure/sibh/sibh-client';
import { respostaDeErro } from '@/app/api/_helpers/erros';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/sibh/estacoes
 *
 * Lista as estações do SIBH (proxy server-side, sem CORS). Exige sessão.
 * Serve o módulo Monitor e o "ao vivo" dos Diagramas.
 */
export async function GET() {
  const auth = await exigirUsuario();
  if (auth instanceof NextResponse) return auth;

  try {
    const estacoes = await sibhClient.listarEstacoes();
    return NextResponse.json({ total: estacoes.length, itens: estacoes });
  } catch (e) {
    if (e instanceof SibhIndisponivelError) {
      return NextResponse.json(
        { erro: 'sibh_indisponivel', mensagem: e.message },
        { status: 502 },
      );
    }
    return respostaDeErro('GET /api/sibh/estacoes', {}, e);
  }
}
