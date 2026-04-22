import { NextResponse, type NextRequest } from 'next/server';
import { listarArquivos } from '@/application/use-cases/listar-arquivos';
import { arquivosRepository } from '@/infrastructure/db/arquivos-repository.pg';
import { auditoriaRepository } from '@/infrastructure/db/auditoria-repository.pg';
import type { RespostaArquivos, RespostaErro } from '@/types/dto';

export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ prefixo: string }> },
) {
  const { prefixo: prefixoRaw } = await ctx.params;
  const prefixo = decodeURIComponent(prefixoRaw);

  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    null;
  const userAgent = request.headers.get('user-agent');

  try {
    const resultado = await listarArquivos(arquivosRepository, auditoriaRepository, {
      prefixo,
      ip,
      userAgent,
      usuarioId: null,
    });
    const body: RespostaArquivos = resultado;
    return NextResponse.json(body);
  } catch {
    const body: RespostaErro = {
      erro: { codigo: 'ERRO_INTERNO', mensagem: 'Falha ao listar arquivos.' },
    };
    return NextResponse.json(body, { status: 500 });
  }
}
