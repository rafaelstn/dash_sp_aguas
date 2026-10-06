import { NextResponse } from 'next/server';
import { facetasRepository } from '@/infrastructure/repositories';
import { listarFacetas } from '@/application/use-cases/listar-facetas';
import { exigirUsuario } from '@/app/api/_helpers/auth';
import type { RespostaErro } from '@/types/dto';

export const dynamic = 'force-dynamic';

/**
 * GET /api/postos/facetas — valores distintos de mantenedor, UGRHI, municipio,
 * bacia e tipo, para montar os filtros da busca (`PainelFiltros`).
 *
 * Recusa no HANDLER desde 06/10/2026 (achado do Andre, PO de Seguranca): o
 * handler nao tinha checagem nenhuma e a unica barreira era o middleware, que
 * REDIRECIONA para `/login` em vez de recusar. Nao e dado pessoal, mas e o
 * recorte do acervo do orgao (quais mantenedores e quais bacias existem), e
 * rota de API da casa recusa por conta propria.
 */
export async function GET() {
  const auth = await exigirUsuario();
  if (auth instanceof NextResponse) return auth;

  try {
    const facetas = await listarFacetas(facetasRepository);
    return NextResponse.json(facetas);
  } catch {
    const body: RespostaErro = {
      erro: { codigo: 'ERRO_INTERNO', mensagem: 'Falha ao listar facetas de busca.' },
    };
    return NextResponse.json(body, { status: 500 });
  }
}
