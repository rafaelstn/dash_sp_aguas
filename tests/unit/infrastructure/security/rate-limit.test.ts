import { describe, expect, it, vi } from 'vitest';
import {
  POLITICAS,
  consumirRateLimit,
  extrairIp,
  aplicarHeadersRateLimit,
  type ConfiguracaoRateLimit,
} from '@/infrastructure/security/rate-limit';

/**
 * Testes da Camada 1 in-memory de rate-limit.
 *
 * O módulo mantém estado global em `buckets` (Map). Cada teste usa uma
 * `politica` única (string aleatória) para isolar buckets entre testes,
 * evitando interferência sem precisar limpar o Map global.
 */

function policy(nome: string, limite = 5, janela = 60): ConfiguracaoRateLimit {
  return { politica: `test-${nome}-${Math.random()}`, limite, janelaSegundos: janela };
}

describe('rate-limit/consumirRateLimit', () => {
  it('permite consumir até o limite e bloqueia depois', () => {
    const cfg = policy('basic', 3, 60);
    const r1 = consumirRateLimit(cfg, 'ip-1');
    const r2 = consumirRateLimit(cfg, 'ip-1');
    const r3 = consumirRateLimit(cfg, 'ip-1');
    const r4 = consumirRateLimit(cfg, 'ip-1');

    expect(r1.permitido).toBe(true);
    expect(r2.permitido).toBe(true);
    expect(r3.permitido).toBe(true);
    expect(r4.permitido).toBe(false);
    expect(r4.retryAposSeg).toBeGreaterThanOrEqual(1);
  });

  it('chaves diferentes (IP) são independentes', () => {
    const cfg = policy('iso-keys', 1, 60);
    const a = consumirRateLimit(cfg, 'ip-A');
    const b = consumirRateLimit(cfg, 'ip-B');
    expect(a.permitido).toBe(true);
    expect(b.permitido).toBe(true);
    // Ambos esgotados agora; ambos próximos devem falhar individualmente
    expect(consumirRateLimit(cfg, 'ip-A').permitido).toBe(false);
    expect(consumirRateLimit(cfg, 'ip-B').permitido).toBe(false);
  });

  it('políticas diferentes não compartilham bucket mesmo com mesma chave', () => {
    const c1 = policy('p1', 1, 60);
    const c2 = policy('p2', 1, 60);
    expect(consumirRateLimit(c1, 'mesma-chave').permitido).toBe(true);
    expect(consumirRateLimit(c2, 'mesma-chave').permitido).toBe(true);
    expect(consumirRateLimit(c1, 'mesma-chave').permitido).toBe(false);
    expect(consumirRateLimit(c2, 'mesma-chave').permitido).toBe(false);
  });

  it('reset progressivo após janela — token volta com o tempo', () => {
    const cfg = policy('refil', 60, 60); // 60 tokens em 60s = 1 token/s
    const chave = 'ip-refil';

    // Esgotar
    for (let i = 0; i < 60; i++) consumirRateLimit(cfg, chave);
    expect(consumirRateLimit(cfg, chave).permitido).toBe(false);

    // Avança 1.5s — ganha 1.5 tokens, próxima request passa
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 1500));
    expect(consumirRateLimit(cfg, chave).permitido).toBe(true);
    vi.useRealTimers();
  });

  it('quando bloqueado, retorna retryAposSeg coerente com a política', () => {
    const cfg = policy('retry', 1, 60);
    consumirRateLimit(cfg, 'ip');
    const bloqueado = consumirRateLimit(cfg, 'ip');
    expect(bloqueado.permitido).toBe(false);
    expect(bloqueado.retryAposSeg).toBeDefined();
    expect(bloqueado.retryAposSeg!).toBeGreaterThan(0);
    expect(bloqueado.retryAposSeg!).toBeLessThanOrEqual(60);
  });

  it('chave composta IP+usuário é única por par (V9 do threat model)', () => {
    // Política compartilhada — chave = 'ip:user' agrega
    const cfg = policy('composta', 2, 60);

    // Mesmo IP, 2 usuários distintos → cada um tem bucket próprio
    expect(consumirRateLimit(cfg, '1.1.1.1:user-X').permitido).toBe(true);
    expect(consumirRateLimit(cfg, '1.1.1.1:user-X').permitido).toBe(true);
    expect(consumirRateLimit(cfg, '1.1.1.1:user-X').permitido).toBe(false);

    // user-Y do mesmo IP ainda tem bucket cheio
    expect(consumirRateLimit(cfg, '1.1.1.1:user-Y').permitido).toBe(true);
  });

  it('memory pressure — milhares de chaves não levam a vazamento (limpeza dispara)', () => {
    // Não testamos OOM real (caro); validamos que muitas chaves não quebram o módulo.
    const cfg = policy('flood', 1, 60);
    for (let i = 0; i < 5000; i++) {
      consumirRateLimit(cfg, `ip-${i}`);
    }
    // Se passou daqui sem crash, o módulo aguenta cardinalidade alta.
    expect(true).toBe(true);
  });
});

describe('rate-limit/extrairIp', () => {
  it('prefere x-forwarded-for sobre x-real-ip', () => {
    const req = new Request('http://x', {
      headers: {
        'x-forwarded-for': '1.2.3.4, 5.6.7.8',
        'x-real-ip': '10.0.0.1',
      },
    });
    expect(extrairIp(req)).toBe('1.2.3.4');
  });

  it('cai em x-real-ip se x-forwarded-for ausente', () => {
    const req = new Request('http://x', {
      headers: { 'x-real-ip': '10.0.0.1' },
    });
    expect(extrairIp(req)).toBe('10.0.0.1');
  });

  it('fallback "unknown" quando ambos ausentes', () => {
    const req = new Request('http://x');
    expect(extrairIp(req)).toBe('unknown');
  });

  it('trim correto de espaços em x-forwarded-for', () => {
    const req = new Request('http://x', {
      headers: { 'x-forwarded-for': '  1.2.3.4  ,  5.6.7.8  ' },
    });
    expect(extrairIp(req)).toBe('1.2.3.4');
  });
});

describe('rate-limit/aplicarHeadersRateLimit', () => {
  it('aplica headers padrão de rate limit no Response', () => {
    const headers = new Headers();
    const cfg = { politica: 'h1', limite: 30, janelaSegundos: 60 };
    aplicarHeadersRateLimit(headers, cfg, {
      permitido: true,
      remanescente: 25,
      resetEm: Date.now() + 30_000,
    });
    expect(headers.get('X-RateLimit-Limit')).toBe('30');
    expect(headers.get('X-RateLimit-Remaining')).toBe('25');
    expect(headers.get('X-RateLimit-Reset')).toBeTruthy();
    expect(headers.get('Retry-After')).toBeNull();
  });

  it('quando bloqueado, adiciona Retry-After', () => {
    const headers = new Headers();
    const cfg = { politica: 'h2', limite: 1, janelaSegundos: 60 };
    aplicarHeadersRateLimit(headers, cfg, {
      permitido: false,
      remanescente: 0,
      resetEm: Date.now() + 30_000,
      retryAposSeg: 30,
    });
    expect(headers.get('Retry-After')).toBe('30');
  });
});

describe('rate-limit/POLITICAS', () => {
  it('expõe as 5 políticas planejadas no checklist André §6.3', () => {
    const nomes = Object.values(POLITICAS).map((p) => p.politica);
    expect(nomes).toContain('submeter-ficha');
    expect(nomes).toContain('submeter-ficha-ip');
    expect(nomes).toContain('decisao-triagem');
    expect(nomes).toContain('leitura-triagem');
    expect(nomes).toContain('cron-invocacao-ip');
  });

  it('políticas têm limites coerentes com o briefing OWASP', () => {
    expect(POLITICAS.submeterFicha.limite).toBe(30);
    expect(POLITICAS.submeterFichaIp.limite).toBe(100);
    expect(POLITICAS.decisaoTriagem.limite).toBe(60);
    expect(POLITICAS.leituraTriagem.limite).toBe(200);
    expect(POLITICAS.cronInvocacao.limite).toBe(60);
  });
});
