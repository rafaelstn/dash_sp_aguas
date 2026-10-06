import { NextResponse, type NextRequest } from 'next/server';
import { listarArquivos } from '@/application/use-cases/listar-arquivos';
import { arquivosRepository, auditoriaRepository } from '@/infrastructure/repositories';
import { exigirUsuario } from '@/app/api/_helpers/auth';
import { extrairIpOuNulo } from '@/infrastructure/security/rate-limit';
import type { RespostaArquivos, RespostaErro } from '@/types/dto';

/**
 * GET /api/postos/[prefixo]/arquivos — lista os arquivos indexados do posto e
 * GRAVA uma linha na trilha de acesso (`acesso_ficha`, acao `listou_arquivos`).
 *
 * Dois defeitos consertados em 06/10/2026 (achado do Andre, PO de Seguranca):
 *
 * 1. A rota lia `obterUsuarioAtual()` e NAO recusava quando vinha null: a
 *    listagem saia e a trilha gravava `usuarioId: null`, ou seja, acesso a
 *    dado do orgao registrado sem ator. O middleware redirecionava para
 *    `/login`, mas redirecionar nao e recusar, e depender dele deixa a rota
 *    descoberta no dia que o matcher mudar. Agora recusa no HANDLER, com
 *    `exigirUsuario`, igual ao resto da API (defesa em profundidade, a mesma
 *    razao da migration 0040).
 * 2. O IP vinha do PRIMEIRO elemento de `x-forwarded-for`, que o cliente
 *    controla: quem chamasse a rota escolhia o IP que a trilha ia registrar,
 *    sem deixar rastro. Agora usa `extrairIpOuNulo`, que prefere o header que a
 *    borda sobrescreve e, no ultimo recurso, pega o ULTIMO elemento da cadeia.
 */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ prefixo: string }> },
) {
  const auth = await exigirUsuario();
  if (auth instanceof NextResponse) return auth;

  const { prefixo: prefixoRaw } = await ctx.params;
  const prefixo = decodeURIComponent(prefixoRaw);

  const ip = extrairIpOuNulo(request);
  const userAgent = request.headers.get('user-agent');

  try {
    const resultado = await listarArquivos(arquivosRepository, auditoriaRepository, {
      prefixo,
      ip,
      userAgent,
      usuarioId: auth.id,
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
