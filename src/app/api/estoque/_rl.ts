import { NextResponse } from 'next/server';
import {
  POLITICAS,
  aplicarHeadersRateLimit,
  consumirRateLimit,
} from '@/infrastructure/security/rate-limit';
import {
  USUARIO_SEM_IDENTIDADE,
  acessoSemIdentidadeAtivo,
} from '@/infrastructure/auth/acesso-sem-identidade';

/**
 * Chave do balde. Com identidade, é o usuário. Na janela sem identidade todos
 * são o mesmo usuário institucional, e um balde por usuário viraria um balde
 * para o órgão inteiro: um leitor disparando derrubaria a conferência de todos.
 * Ali a chave é o IP de origem.
 *
 * Só `x-real-ip`, que o Nginx do órgão SOBRESCREVE com `$remote_addr`. Não usar
 * `extrairIp`: ele confia antes em `x-vercel-forwarded-for`, que o cliente
 * forja e o Nginx não limpa, e cada valor forjado ganharia um balde novo.
 */
export function chaveRateLimit(usuarioId: string, request: Pick<Request, 'headers'>): string {
  if (acessoSemIdentidadeAtivo() && usuarioId === USUARIO_SEM_IDENTIDADE.id) {
    return `anon:${request.headers.get('x-real-ip')?.trim() || 'unknown'}`;
  }
  return usuarioId;
}

/**
 * Helper de rate limit das rotas de estoque. Consome 1 token da politica e ja
 * devolve os headers `X-RateLimit-*`. Se estourou, `resposta` e o 429 pronto;
 * senao `resposta` e null e os `headers` devem ser anexados a resposta final.
 */
export function checarRateLimit(
  politica: 'leituraEstoque' | 'movimentacaoEstoque' | 'conferenciaEstoque',
  usuarioId: string,
  request: Pick<Request, 'headers'>,
): { headers: Headers; resposta: NextResponse | null } {
  const cfg = POLITICAS[politica];
  const headers = new Headers();
  const rl = consumirRateLimit(cfg, chaveRateLimit(usuarioId, request));
  aplicarHeadersRateLimit(headers, cfg, rl);
  if (!rl.permitido) {
    return {
      headers,
      resposta: NextResponse.json(
        { erro: 'rate_limit', mensagem: 'Muitas requisições. Tente em instantes.' },
        { status: 429, headers },
      ),
    };
  }
  return { headers, resposta: null };
}
