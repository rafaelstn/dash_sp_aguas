import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const anonimizarPiiRetida = vi.fn(async (dias: number) => [
  { tabela: 'acesso_ficha', linhasAnonimizadas: dias >= 180 ? 7 : 0 },
]);

vi.mock('@/infrastructure/repositories', () => ({
  auditoriaRepository: {
    registrarAcesso: vi.fn(),
    listarRecentesDoUsuario: vi.fn(),
    anonimizarPiiRetida,
  },
}));

const SECRET = process.env.CRON_SECRET ?? '0123456789abcdef0123456789abcdef';

async function chamar(headers: Record<string, string> = {}) {
  const { GET } = await import('@/app/api/cron/anonimizar-trilha/route');
  // IP variavel por chamada: o rate limit do cron e por IP e um teste nao pode
  // derrubar o seguinte.
  const ip = `10.0.0.${Math.floor(Math.random() * 250) + 1}`;
  return GET(
    new NextRequest('https://exemplo.gov.br/api/cron/anonimizar-trilha', {
      headers: { 'x-forwarded-for': ip, ...headers },
    }),
  );
}

describe('rota/cron anonimizar-trilha (LGPD-4)', () => {
  beforeEach(() => {
    anonimizarPiiRetida.mockClear();
    delete process.env.TRILHA_RETENCAO_DIAS;
  });

  afterEach(() => {
    delete process.env.TRILHA_RETENCAO_DIAS;
  });

  it('sem secret responde 401 e nao toca na trilha', async () => {
    const r = await chamar();
    expect(r.status).toBe(401);
    expect(anonimizarPiiRetida).not.toHaveBeenCalled();
  });

  it('secret errado responde o MESMO 401 de secret ausente (sem oraculo)', async () => {
    const r = await chamar({ 'x-cron-secret': 'x'.repeat(SECRET.length) });
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ erro: 'nao_autorizado' });
    expect(anonimizarPiiRetida).not.toHaveBeenCalled();
  });

  it('secret de tamanho diferente tambem e 401, nao 500', async () => {
    const r = await chamar({ 'x-cron-secret': 'curto' });
    expect(r.status).toBe(401);
  });

  it('aceita Bearer (formato do agendador) e roda com o prazo padrao', async () => {
    const r = await chamar({ authorization: `Bearer ${SECRET}` });
    expect(r.status).toBe(200);
    expect(anonimizarPiiRetida).toHaveBeenCalledWith(180);
    expect(await r.json()).toMatchObject({ diasRetencao: 180, total: 7 });
  });

  it('aceita x-cron-secret (chamada manual)', async () => {
    const r = await chamar({ 'x-cron-secret': SECRET });
    expect(r.status).toBe(200);
  });

  // A anonimizacao e irreversivel: o endpoint nao pode virar ferramenta de
  // destruicao de evidencia para quem tiver o secret.
  it('ignora prazo vindo da querystring', async () => {
    const { GET } = await import('@/app/api/cron/anonimizar-trilha/route');
    const r = await GET(
      new NextRequest('https://exemplo.gov.br/api/cron/anonimizar-trilha?dias=1', {
        headers: { 'x-forwarded-for': '10.0.1.1', 'x-cron-secret': SECRET },
      }),
    );
    expect(r.status).toBe(200);
    expect(anonimizarPiiRetida).toHaveBeenCalledWith(180);
  });

  it('prazo do ambiente abaixo do piso cai no padrao em vez de apagar demais', async () => {
    process.env.TRILHA_RETENCAO_DIAS = '2';
    const r = await chamar({ 'x-cron-secret': SECRET });
    expect(r.status).toBe(200);
    expect(anonimizarPiiRetida).toHaveBeenCalledWith(180);
  });

  it('prazo valido do ambiente e respeitado', async () => {
    process.env.TRILHA_RETENCAO_DIAS = '365';
    const r = await chamar({ 'x-cron-secret': SECRET });
    expect(r.status).toBe(200);
    expect(anonimizarPiiRetida).toHaveBeenCalledWith(365);
  });
});
