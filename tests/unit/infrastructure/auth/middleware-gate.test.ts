import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Comportamento do gate do middleware, medido dirigindo requisições.
 *
 * Existe por causa de um defeito real encontrado em 02/09/2026: o middleware
 * tinha um desvio `if (!url || !anon) return next()`, comentado como "dev local
 * sem Supabase: libera (env.ts bloqueia em produção)". A segunda metade era
 * falsa, porque `env.ts` nunca é importado pelo middleware. E como
 * `NEXT_PUBLIC_*` é substituída em tempo de BUILD, uma imagem construída sem os
 * `--build-arg` servia o sistema inteiro sem autenticação, de dentro da imagem,
 * sem correção possível por variável de ambiente no servidor.
 *
 * Um teste que só lesse o texto do arquivo não pegaria isso. Estes casos
 * afirmam o EFEITO, nas duas direções, e é o que impede o desvio de voltar.
 */

const ROTA_PRIVADA = 'http://localhost:3000/postos';
const ROTA_PUBLICA = 'http://localhost:3000/api/health';

async function rodar(url: string) {
  // Import dinâmico: o middleware lê process.env no momento da chamada, e o
  // módulo precisa ser reavaliado a cada configuração de ambiente.
  const { middleware } = await import('@/middleware');
  return middleware(new NextRequest(new Request(url)));
}

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
  vi.stubEnv('ACESSO_SEM_IDENTIDADE', '');
  vi.stubEnv('DEV_BYPASS_AUTH_EMAIL', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('produção sem identidade configurada', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
  });

  it('RECUSA a rota privada com 503 em vez de servir sem autenticação', async () => {
    const resp = await rodar(ROTA_PRIVADA);
    expect(resp.status).toBe(503);
  });

  it('explica o que fazer, em vez de recusar em silêncio', async () => {
    const resp = await rodar(ROTA_PRIVADA);
    const corpo = await resp.text();
    expect(corpo).toContain('ACESSO_SEM_IDENTIDADE');
    expect(corpo).toContain('NEXT_PUBLIC_SUPABASE_URL');
  });

  it('mantém a rota pública servida, para o healthcheck do container responder', async () => {
    const resp = await rodar(ROTA_PUBLICA);
    expect(resp.status).not.toBe(503);
  });
});

describe('desenvolvimento sem Supabase', () => {
  it('continua liberando, que é a conveniência legítima de dev local', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const resp = await rodar(ROTA_PRIVADA);
    expect(resp.status).not.toBe(503);
    expect(resp.headers.get('location')).toBeNull();
  });
});

describe('janela sem identidade declarada', () => {
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('ACESSO_SEM_IDENTIDADE', 'sim');
    vi.stubEnv(
      'ACESSO_SEM_IDENTIDADE_MOTIVO',
      'Servidor da PRODESP sem internet, aguardando a API de login do orgao.',
    );
    vi.stubEnv('ACESSO_SEM_IDENTIDADE_REVISAR_EM', '2026-12-01');
  });

  it('serve a rota privada sem exigir sessão', async () => {
    const resp = await rodar(ROTA_PRIVADA);
    expect(resp.status).not.toBe(503);
    expect(resp.headers.get('location')).toBeNull();
  });

  it('desvia /login para a raiz, porque não há o que autenticar', async () => {
    const resp = await rodar('http://localhost:3000/login');
    expect(resp.status).toBe(307);
    expect(new URL(resp.headers.get('location')!).pathname).toBe('/');
  });

  /**
   * A janela é do AMBIENTE, nunca do artefato. Se alguém prefixar a variável
   * com NEXT_PUBLIC_, ela passa a ser substituída em tempo de build e o modo
   * aberto vira propriedade da imagem, que foi exatamente o defeito original.
   */
  it('NÃO liga por variável de build com prefixo NEXT_PUBLIC_', async () => {
    vi.stubEnv('ACESSO_SEM_IDENTIDADE', '');
    vi.stubEnv('NEXT_PUBLIC_ACESSO_SEM_IDENTIDADE', 'sim');
    const resp = await rodar(ROTA_PRIVADA);
    expect(resp.status).toBe(503);
  });
});
