import { NextResponse, type NextRequest } from 'next/server';
import { obterFicha } from '@/application/use-cases/obter-ficha';
import { postosRepository, auditoriaRepository } from '@/infrastructure/repositories';
import { PostoNaoEncontrado } from '@/domain/errors';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import type { RespostaErro, RespostaFicha } from '@/types/dto';

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
  const usuario = await obterUsuarioAtual();

  try {
    const posto = await obterFicha(postosRepository, auditoriaRepository, {
      prefixo,
      ip,
      userAgent,
      usuarioId: usuario?.id ?? null,
    });
    const body: RespostaFicha = posto;
    return NextResponse.json(body);
  } catch (e) {
    if (e instanceof PostoNaoEncontrado) {
      const body: RespostaErro = {
        erro: { codigo: 'POSTO_NAO_ENCONTRADO', mensagem: e.message },
      };
      return NextResponse.json(body, { status: 404 });
    }
    const body: RespostaErro = {
      erro: { codigo: 'ERRO_INTERNO', mensagem: 'Falha ao obter ficha do posto.' },
    };
    return NextResponse.json(body, { status: 500 });
  }
}
