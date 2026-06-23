import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { exigirUsuario } from '@/app/api/_helpers/auth';
import { sibhClient, SibhIndisponivelError } from '@/infrastructure/sibh/sibh-client';
import { logger } from '@/infrastructure/logging/logger';

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
    const correlationId = randomUUID();
    logger.error(
      'sibh.estacoes.erro_inesperado',
      { correlationId, rota: 'GET /api/sibh/estacoes', erro: String(e) },
      'Falha ao listar estações do SIBH',
    );
    return NextResponse.json(
      {
        erro: 'falha_listar_estacoes',
        mensagem: 'Falha ao consultar estações do SIBH.',
        correlationId,
      },
      { status: 500 },
    );
  }
}
