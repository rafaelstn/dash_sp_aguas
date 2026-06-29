/**
 * Cobertura da ORQUESTRAÇÃO das rotas de gestão de usuários
 * (`/api/admin/usuarios` POST e `[id]` PATCH/DELETE). A decisão pura de
 * autorização vive em `domain/auth/gestao-acesso.ts` (testada à parte); aqui
 * garantimos que a rota: resolve o papel do ATOR no servidor, aplica a regra,
 * traduz o motivo em HTTP correto (403 privilégio x 409 último super), valida a
 * senha e só chama o repositório quando autorizado. (Endereça o achado M3 do QA;
 * exigência de teste de RBAC para cliente governo.)
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { NextResponse } from 'next/server';

const obterUsuarioAtualMock = vi.fn();
const obterPapelMock = vi.fn();
const criarMock = vi.fn();
const definirPapelMock = vi.fn();
const resetarSenhaMock = vi.fn();
const removerMock = vi.fn();
const contarSuperAdminsMock = vi.fn();

vi.mock('@/infrastructure/auth/current-user', () => ({
  obterUsuarioAtual: () => obterUsuarioAtualMock(),
}));

vi.mock('@/infrastructure/repositories', () => ({
  papeisRepository: {
    obterPapel: (id: string) => obterPapelMock(id),
    ehAprovador: async () => true,
  },
  usuariosAdminRepository: {
    criar: (d: unknown) => criarMock(d),
    definirPapel: (id: string, papel: string) => definirPapelMock(id, papel),
    resetarSenha: (id: string, s: string) => resetarSenhaMock(id, s),
    remover: (id: string) => removerMock(id),
    contarSuperAdmins: () => contarSuperAdminsMock(),
  },
}));

// Rate limit sempre liberado (não é o objeto do teste).
vi.mock('@/infrastructure/security/rate-limit', () => ({
  POLITICAS: { mutacaoAdminUsuarios: {}, leituraAdminUsuarios: {} },
  consumirRateLimit: () => ({ permitido: true, restante: 99, resetEm: 0 }),
  aplicarHeadersRateLimit: () => {},
}));

import { POST } from '@/app/api/admin/usuarios/route';
import { PATCH, DELETE } from '@/app/api/admin/usuarios/[id]/route';

const SUPER = '11111111-1111-4111-8111-111111111111';
const ADMIN = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';
const OUTRO_SUPER = '44444444-4444-4444-8444-444444444444';

const SENHA_OK = 'Spaguas@2026!';

function papeis(mapa: Record<string, string>, fallback = 'user') {
  obterPapelMock.mockImplementation(async (id: string) => mapa[id] ?? fallback);
}

function reqJson(body: unknown) {
  return new Request('http://localhost/api/admin/usuarios', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0];
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

async function corpo(resp: NextResponse) {
  return resp.json();
}

beforeEach(() => {
  vi.clearAllMocks();
  contarSuperAdminsMock.mockResolvedValue(2);
});

describe('POST /api/admin/usuarios (criar)', () => {
  it('admin cria user comum -> 201 e grava', async () => {
    obterUsuarioAtualMock.mockResolvedValue({ id: ADMIN, email: 'a@sp.gov.br', nome: 'A' });
    papeis({ [ADMIN]: 'admin' });
    criarMock.mockResolvedValue('novo-id');

    const resp = await POST(reqJson({ nome: 'Novo', email: 'novo@sp.gov.br', senha: SENHA_OK, papel: 'user' }));
    expect(resp.status).toBe(201);
    expect(criarMock).toHaveBeenCalledOnce();
  });

  it('admin NÃO pode criar admin -> 403 e não grava', async () => {
    obterUsuarioAtualMock.mockResolvedValue({ id: ADMIN, email: 'a@sp.gov.br', nome: 'A' });
    papeis({ [ADMIN]: 'admin' });

    const resp = await POST(reqJson({ nome: 'Teste', email: 'x@sp.gov.br', senha: SENHA_OK, papel: 'admin' }));
    expect(resp.status).toBe(403);
    expect(criarMock).not.toHaveBeenCalled();
  });

  it('super cria admin -> 201', async () => {
    obterUsuarioAtualMock.mockResolvedValue({ id: SUPER, email: 's@sp.gov.br', nome: 'S' });
    papeis({ [SUPER]: 'super_admin' });
    criarMock.mockResolvedValue('novo-id');

    const resp = await POST(reqJson({ nome: 'Adm', email: 'adm@sp.gov.br', senha: SENHA_OK, papel: 'admin' }));
    expect(resp.status).toBe(201);
  });

  it('senha fraca -> 400 e não grava', async () => {
    obterUsuarioAtualMock.mockResolvedValue({ id: SUPER, email: 's@sp.gov.br', nome: 'S' });
    papeis({ [SUPER]: 'super_admin' });

    const resp = await POST(reqJson({ nome: 'Teste', email: 'x@sp.gov.br', senha: 'fraca', papel: 'user' }));
    expect(resp.status).toBe(400);
    expect(criarMock).not.toHaveBeenCalled();
  });

  it('user comum não acessa a criação -> 403', async () => {
    obterUsuarioAtualMock.mockResolvedValue({ id: USER, email: 'u@sp.gov.br', nome: 'U' });
    papeis({ [USER]: 'user' });

    const resp = await POST(reqJson({ nome: 'Teste', email: 'x@sp.gov.br', senha: SENHA_OK, papel: 'user' }));
    expect(resp.status).toBe(403);
  });
});

describe('PATCH /api/admin/usuarios/[id]', () => {
  function patchReq(body: unknown) {
    return new Request('http://localhost/api/admin/usuarios/x', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }) as unknown as Parameters<typeof PATCH>[0];
  }

  it('admin reseta senha de user -> 200', async () => {
    obterUsuarioAtualMock.mockResolvedValue({ id: ADMIN, email: 'a@sp.gov.br', nome: 'A' });
    papeis({ [ADMIN]: 'admin', [USER]: 'user' });

    const resp = await PATCH(patchReq({ novaSenha: SENHA_OK }), ctx(USER));
    expect(resp.status).toBe(200);
    expect(resetarSenhaMock).toHaveBeenCalledOnce();
  });

  it('admin NÃO pode promover user a admin -> 403', async () => {
    obterUsuarioAtualMock.mockResolvedValue({ id: ADMIN, email: 'a@sp.gov.br', nome: 'A' });
    papeis({ [ADMIN]: 'admin', [USER]: 'user' });

    const resp = await PATCH(patchReq({ papel: 'admin' }), ctx(USER));
    expect(resp.status).toBe(403);
    expect(definirPapelMock).not.toHaveBeenCalled();
  });

  it('rebaixar o ÚLTIMO super admin -> 409', async () => {
    obterUsuarioAtualMock.mockResolvedValue({ id: SUPER, email: 's@sp.gov.br', nome: 'S' });
    papeis({ [SUPER]: 'super_admin', [OUTRO_SUPER]: 'super_admin' });
    contarSuperAdminsMock.mockResolvedValue(1);

    const resp = await PATCH(patchReq({ papel: 'admin' }), ctx(OUTRO_SUPER));
    expect(resp.status).toBe(409);
    expect((await corpo(resp)) as { erro: string }).toMatchObject({ erro: 'ultimo_super_admin' });
  });

  it('ninguém altera o próprio papel -> 403', async () => {
    obterUsuarioAtualMock.mockResolvedValue({ id: SUPER, email: 's@sp.gov.br', nome: 'S' });
    papeis({ [SUPER]: 'super_admin' });

    const resp = await PATCH(patchReq({ papel: 'admin' }), ctx(SUPER));
    expect(resp.status).toBe(403);
  });
});

describe('DELETE /api/admin/usuarios/[id]', () => {
  function delReq() {
    return new Request('http://localhost/api/admin/usuarios/x', { method: 'DELETE' }) as unknown as Parameters<typeof DELETE>[0];
  }

  it('admin remove user -> 200', async () => {
    obterUsuarioAtualMock.mockResolvedValue({ id: ADMIN, email: 'a@sp.gov.br', nome: 'A' });
    papeis({ [ADMIN]: 'admin', [USER]: 'user' });

    const resp = await DELETE(delReq(), ctx(USER));
    expect(resp.status).toBe(200);
    expect(removerMock).toHaveBeenCalledWith(USER);
  });

  it('admin NÃO pode remover admin -> 403', async () => {
    obterUsuarioAtualMock.mockResolvedValue({ id: ADMIN, email: 'a@sp.gov.br', nome: 'A' });
    papeis({ [ADMIN]: 'admin', [OUTRO_SUPER]: 'admin' });

    const resp = await DELETE(delReq(), ctx(OUTRO_SUPER));
    expect(resp.status).toBe(403);
    expect(removerMock).not.toHaveBeenCalled();
  });

  it('remover o último super admin -> 409', async () => {
    obterUsuarioAtualMock.mockResolvedValue({ id: SUPER, email: 's@sp.gov.br', nome: 'S' });
    papeis({ [SUPER]: 'super_admin', [OUTRO_SUPER]: 'super_admin' });
    contarSuperAdminsMock.mockResolvedValue(1);

    const resp = await DELETE(delReq(), ctx(OUTRO_SUPER));
    expect(resp.status).toBe(409);
  });

  it('ninguém se auto-remove -> 403', async () => {
    obterUsuarioAtualMock.mockResolvedValue({ id: SUPER, email: 's@sp.gov.br', nome: 'S' });
    papeis({ [SUPER]: 'super_admin' });

    const resp = await DELETE(delReq(), ctx(SUPER));
    expect(resp.status).toBe(403);
    expect(removerMock).not.toHaveBeenCalled();
  });
});
