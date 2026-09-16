/**
 * POST /api/desconformidades/revisoes na janela sem identidade (ADR-0024).
 *
 * Decisão do André, 16/09/2026: marcar "revisado" é afirmação de que alguém
 * conferiu, não tem caminho de reabrir no produto e o UPSERT troca a autoria de
 * quem revisou antes com login. Na janela fica 403.
 *
 * O helper de autorização é o REAL (só a identidade e o repositório são dublês),
 * e a prova é pelo efeito: o repositório não é chamado quando a rota recusa.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const usuarioAtual = vi.fn();
const marcarRevisado = vi.fn();

vi.mock('@/infrastructure/auth/current-user', () => ({
  obterUsuarioAtual: () => usuarioAtual(),
}));

vi.mock('@/infrastructure/repositories', () => ({
  papeisRepository: { obterPapel: vi.fn(), ehAprovador: vi.fn() },
  revisoesRepository: { marcarRevisado: (p: unknown) => marcarRevisado(p), reabrir: vi.fn() },
}));

vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-real-ip': '10.0.0.9' }),
}));

const { POST } = await import('@/app/api/desconformidades/revisoes/route');
const { USUARIO_SEM_IDENTIDADE } = await import('@/infrastructure/auth/acesso-sem-identidade');

const PESSOA = { id: '11111111-1111-4111-8111-111111111111', email: 'tecnico@exemplo-dmo.test', nome: null };
const CORPO = { tipoEntidade: 'posto', idEntidade: '3D-001', categoria: 'PREFIXO_PRINCIPAL' };

function post() {
  return POST(
    new Request('http://localhost/api/desconformidades/revisoes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(CORPO),
    }),
  );
}

let original: string | undefined;

beforeEach(() => {
  original = process.env.ACESSO_SEM_IDENTIDADE;
  delete process.env.ACESSO_SEM_IDENTIDADE;
  usuarioAtual.mockReset();
  marcarRevisado.mockReset();
  marcarRevisado.mockImplementation(async (p: { usuarioId: string }) => ({ ...CORPO, status: 'revisado', usuarioId: p.usuarioId }));
});

afterEach(() => {
  if (original === undefined) delete process.env.ACESSO_SEM_IDENTIDADE;
  else process.env.ACESSO_SEM_IDENTIDADE = original;
});

describe('POST /api/desconformidades/revisoes e a janela sem identidade', () => {
  it('controle: com autenticação ligada, pessoa identificada grava com o próprio id', async () => {
    usuarioAtual.mockResolvedValue(PESSOA);
    const resp = await post();
    expect(resp.status).toBe(200);
    expect(marcarRevisado).toHaveBeenCalledTimes(1);
    expect(marcarRevisado.mock.calls[0]?.[0]).toMatchObject({ usuarioId: PESSOA.id, idEntidade: '3D-001' });
  });

  it('janela ligada: 403 e nada é gravado', async () => {
    process.env.ACESSO_SEM_IDENTIDADE = 'sim';
    usuarioAtual.mockResolvedValue({ ...USUARIO_SEM_IDENTIDADE });
    const resp = await post();
    expect(resp.status).toBe(403);
    expect(await resp.json()).toMatchObject({ erro: 'identificacao_obrigatoria' });
    expect(marcarRevisado).not.toHaveBeenCalled();
  });

  it('janela desligada, mas o id institucional chega: 403 do mesmo jeito', async () => {
    usuarioAtual.mockResolvedValue({ ...USUARIO_SEM_IDENTIDADE });
    const resp = await post();
    expect(resp.status).toBe(403);
    expect(marcarRevisado).not.toHaveBeenCalled();
  });

  it('sem sessão continua 401, antes da regra da janela', async () => {
    usuarioAtual.mockResolvedValue(null);
    const resp = await post();
    expect(resp.status).toBe(401);
    expect(marcarRevisado).not.toHaveBeenCalled();
  });
});
