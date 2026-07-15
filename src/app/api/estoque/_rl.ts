import { NextResponse } from 'next/server';
import {
  POLITICAS,
  aplicarHeadersRateLimit,
  consumirRateLimit,
} from '@/infrastructure/security/rate-limit';

/**
 * Helper de rate limit das rotas de estoque. Consome 1 token da politica e ja
 * devolve os headers `X-RateLimit-*`. Se estourou, `resposta` e o 429 pronto;
 * senao `resposta` e null e os `headers` devem ser anexados a resposta final.
 */
export function checarRateLimit(
  politica: 'leituraEstoque' | 'movimentacaoEstoque' | 'conferenciaEstoque',
  chave: string,
): { headers: Headers; resposta: NextResponse | null } {
  const cfg = POLITICAS[politica];
  const headers = new Headers();
  const rl = consumirRateLimit(cfg, chave);
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
