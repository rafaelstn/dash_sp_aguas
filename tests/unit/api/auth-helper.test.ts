/**
 * Cobertura do helper de autorização compartilhado em
 * `src/app/api/_helpers/auth.ts`. Foco nos invariantes que defendem contra
 * IDOR cross-técnico em /api/fichas/[id] e /api/postos/[prefixo]/fichas:
 *   1. exigirUsuario retorna 401 sem sessão.
 *   2. permitirDonoOuAprovador libera o autor.
 *   3. permitirDonoOuAprovador libera aprovador mesmo quando não é autor.
 *   4. permitirDonoOuAprovador bloqueia com 403 qualquer outro usuário.
 *   5. permitirDonoOuAprovador trata tecnicoId=null (ficha legada sem autor)
 *      como restrita a aprovadores.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

const obterUsuarioAtualMock = vi.fn();
const ehAprovadorMock = vi.fn();

vi.mock('@/infrastructure/auth/current-user', () => ({
  obterUsuarioAtual: () => obterUsuarioAtualMock(),
}));

vi.mock('@/infrastructure/repositories', () => ({
  papeisRepository: { ehAprovador: (id: string) => ehAprovadorMock(id) },
}));

const dono = { id: 'usuario-dono', email: 'dono@spaguas.sp.gov.br', nome: 'Dono' };
const outro = { id: 'usuario-outro', email: 'outro@spaguas.sp.gov.br', nome: 'Outro' };
const aprovador = { id: 'usuario-aprovador', email: 'apr@spaguas.sp.gov.br', nome: 'Apr' };

async function corpoDe(resp: NextResponse): Promise<unknown> {
  return resp.json();
}

beforeEach(() => {
  obterUsuarioAtualMock.mockReset();
  ehAprovadorMock.mockReset();
});

describe('exigirUsuario', () => {
  it('retorna 401 quando não há sessão', async () => {
    obterUsuarioAtualMock.mockResolvedValue(null);
    const { exigirUsuario } = await import('@/app/api/_helpers/auth');
    const resp = await exigirUsuario();
    expect(resp).toBeInstanceOf(NextResponse);
    if (!(resp instanceof NextResponse)) throw new Error('inalcançável');
    expect(resp.status).toBe(401);
    expect(await corpoDe(resp)).toMatchObject({ erro: 'nao_autenticado' });
  });

  it('retorna o usuário quando há sessão', async () => {
    obterUsuarioAtualMock.mockResolvedValue(dono);
    const { exigirUsuario } = await import('@/app/api/_helpers/auth');
    const resp = await exigirUsuario();
    expect(resp).toEqual(dono);
  });
});

describe('permitirDonoOuAprovador', () => {
  it('libera o autor da ficha sem consultar papéis', async () => {
    const { permitirDonoOuAprovador } = await import('@/app/api/_helpers/auth');
    const resp = await permitirDonoOuAprovador(dono, dono.id);
    expect(resp).toBe(true);
    expect(ehAprovadorMock).not.toHaveBeenCalled();
  });

  it('libera aprovador mesmo quando ele não é o autor', async () => {
    ehAprovadorMock.mockResolvedValue(true);
    const { permitirDonoOuAprovador } = await import('@/app/api/_helpers/auth');
    const resp = await permitirDonoOuAprovador(aprovador, dono.id);
    expect(resp).toBe(true);
    expect(ehAprovadorMock).toHaveBeenCalledWith(aprovador.id);
  });

  it('bloqueia com 403 quando não é autor nem aprovador (IDOR)', async () => {
    ehAprovadorMock.mockResolvedValue(false);
    const { permitirDonoOuAprovador } = await import('@/app/api/_helpers/auth');
    const resp = await permitirDonoOuAprovador(outro, dono.id);
    expect(resp).toBeInstanceOf(NextResponse);
    if (!(resp instanceof NextResponse)) throw new Error('inalcançável');
    expect(resp.status).toBe(403);
    expect(await corpoDe(resp)).toMatchObject({ erro: 'sem_permissao' });
  });

  it('com tecnicoId nulo (ficha legada sem autor), exige papel de aprovador', async () => {
    ehAprovadorMock.mockResolvedValue(false);
    const { permitirDonoOuAprovador } = await import('@/app/api/_helpers/auth');
    const resp = await permitirDonoOuAprovador(outro, null);
    expect(resp).toBeInstanceOf(NextResponse);
    if (!(resp instanceof NextResponse)) throw new Error('inalcançável');
    expect(resp.status).toBe(403);
  });
});
