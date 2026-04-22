import { NextResponse, type NextRequest } from 'next/server';
import { buscarPostos } from '@/application/use-cases/buscar-postos';
import { postosRepository } from '@/infrastructure/db/postos-repository.pg';
import { TermoBuscaInvalido } from '@/domain/errors';
import type { RespostaBusca, RespostaErro } from '@/types/dto';

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const termo = sp.get('q') ?? undefined;
  const pagina = Number(sp.get('pagina') ?? 1);
  const porPagina = Number(sp.get('porPagina') ?? 25);

  try {
    const { total, itens } = await buscarPostos(postosRepository, { termo, pagina, porPagina });
    const body: RespostaBusca = { total, pagina, porPagina, itens };
    return NextResponse.json(body);
  } catch (e) {
    if (e instanceof TermoBuscaInvalido) {
      const body: RespostaErro = {
        erro: { codigo: 'TERMO_INVALIDO', mensagem: e.message },
      };
      return NextResponse.json(body, { status: 400 });
    }
    const body: RespostaErro = {
      erro: { codigo: 'ERRO_INTERNO', mensagem: 'Falha ao consultar postos.' },
    };
    return NextResponse.json(body, { status: 500 });
  }
}
