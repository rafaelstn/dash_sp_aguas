import { NextResponse } from 'next/server';
import { facetasRepository } from '@/infrastructure/repositories';
import { listarFacetas } from '@/application/use-cases/listar-facetas';
import type { RespostaErro } from '@/types/dto';

export const dynamic = 'force-dynamic';

export async function GET() {
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
