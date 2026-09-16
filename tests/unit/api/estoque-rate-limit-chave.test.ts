import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { checarRateLimit, chaveRateLimit } from '@/app/api/estoque/_rl';
import { USUARIO_SEM_IDENTIDADE } from '@/infrastructure/auth/acesso-sem-identidade';

/**
 * Balde do rate limit do estoque (revisão do André, 16/09/2026, achado A1).
 * Na janela sem identidade todos são o mesmo usuário; sem isto um leitor
 * disparando esgotava o limite do órgão inteiro.
 */

const OUTRO_USUARIO = '11111111-1111-4111-8111-111111111111';
const req = (h: Record<string, string>) => ({ headers: new Headers(h) });
let original: string | undefined;

beforeEach(() => {
  original = process.env.ACESSO_SEM_IDENTIDADE;
});

afterEach(() => {
  if (original === undefined) delete process.env.ACESSO_SEM_IDENTIDADE;
  else process.env.ACESSO_SEM_IDENTIDADE = original;
});

describe('chaveRateLimit', () => {
  it('na janela, o usuário institucional é separado pelo x-real-ip', () => {
    process.env.ACESSO_SEM_IDENTIDADE = 'sim';
    expect(chaveRateLimit(USUARIO_SEM_IDENTIDADE.id, req({ 'x-real-ip': ' 10.0.0.1 ' }))).toBe('anon:10.0.0.1');
    expect(chaveRateLimit(USUARIO_SEM_IDENTIDADE.id, req({}))).toBe('anon:unknown');
  });

  it('ignora x-vercel-forwarded-for e x-forwarded-for, que o cliente forja', () => {
    process.env.ACESSO_SEM_IDENTIDADE = 'sim';
    const forjado = req({ 'x-real-ip': '10.0.0.1', 'x-vercel-forwarded-for': '1.2.3.4', 'x-forwarded-for': '5.6.7.8' });
    expect(chaveRateLimit(USUARIO_SEM_IDENTIDADE.id, forjado)).toBe('anon:10.0.0.1');
  });

  it('com identidade real, ou com a janela desligada, a chave é o usuário', () => {
    process.env.ACESSO_SEM_IDENTIDADE = 'sim';
    expect(chaveRateLimit(OUTRO_USUARIO, req({ 'x-real-ip': '10.0.0.1' }))).toBe(OUTRO_USUARIO);
    delete process.env.ACESSO_SEM_IDENTIDADE;
    expect(chaveRateLimit(USUARIO_SEM_IDENTIDADE.id, req({ 'x-real-ip': '10.0.0.1' }))).toBe(USUARIO_SEM_IDENTIDADE.id);
  });
});

describe('checarRateLimit na janela', () => {
  it('dois IPs têm baldes independentes; o mesmo IP compartilha', () => {
    process.env.ACESSO_SEM_IDENTIDADE = 'sim';
    const id = USUARIO_SEM_IDENTIDADE.id;
    const restante = (ip: string) =>
      Number(checarRateLimit('conferenciaEstoque', id, req({ 'x-real-ip': ip })).headers.get('x-ratelimit-remaining'));
    const a1 = restante('10.9.0.1');
    const a2 = restante('10.9.0.1');
    const b1 = restante('10.9.0.2');
    expect(a2).toBe(a1 - 1);
    expect(b1).toBe(a1);
  });
});
