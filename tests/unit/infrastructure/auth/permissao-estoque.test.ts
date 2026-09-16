import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Permissão de escrita no estoque (decisão do Rafael, 16/09/2026).
 *
 * A liberação do usuário institucional só existe com a janela sem identidade
 * LIGADA, e só para o id institucional. Os casos procuram a fuga: janela
 * desligada com o id institucional, janela ligada com outro usuário comum e
 * valor de chave parecido com `sim`.
 */

const obterPapel = vi.fn();
vi.mock('@/infrastructure/repositories', () => ({
  papeisRepository: { obterPapel: (id: string) => obterPapel(id) },
}));

const { podeGerenciarEstoque } = await import('@/infrastructure/auth/permissao-estoque');
const { USUARIO_SEM_IDENTIDADE } = await import('@/infrastructure/auth/acesso-sem-identidade');

const OUTRO_USUARIO = '11111111-1111-4111-8111-111111111111';
let original: string | undefined;

beforeEach(() => {
  original = process.env.ACESSO_SEM_IDENTIDADE;
  delete process.env.ACESSO_SEM_IDENTIDADE;
  obterPapel.mockReset();
  obterPapel.mockResolvedValue('user');
});

afterEach(() => {
  if (original === undefined) delete process.env.ACESSO_SEM_IDENTIDADE;
  else process.env.ACESSO_SEM_IDENTIDADE = original;
});

describe('podeGerenciarEstoque com a janela sem identidade DESLIGADA', () => {
  it('nega o usuário institucional, que tem papel user', async () => {
    expect(await podeGerenciarEstoque(USUARIO_SEM_IDENTIDADE.id)).toBe(false);
    expect(obterPapel).toHaveBeenCalledWith(USUARIO_SEM_IDENTIDADE.id);
  });

  it('nega usuário comum', async () => {
    expect(await podeGerenciarEstoque(OUTRO_USUARIO)).toBe(false);
  });

  it('permite admin e super_admin', async () => {
    obterPapel.mockResolvedValueOnce('admin');
    expect(await podeGerenciarEstoque(OUTRO_USUARIO)).toBe(true);
    obterPapel.mockResolvedValueOnce('super_admin');
    expect(await podeGerenciarEstoque(OUTRO_USUARIO)).toBe(true);
  });

  it.each(['true', '1', 'yes', 'si', ''])('continua negando com ACESSO_SEM_IDENTIDADE=%j', async (valor) => {
    process.env.ACESSO_SEM_IDENTIDADE = valor;
    expect(await podeGerenciarEstoque(USUARIO_SEM_IDENTIDADE.id)).toBe(false);
  });
});

describe('podeGerenciarEstoque com a janela sem identidade LIGADA', () => {
  beforeEach(() => {
    process.env.ACESSO_SEM_IDENTIDADE = 'sim';
  });

  it('permite o usuário institucional sem consultar papel', async () => {
    expect(await podeGerenciarEstoque(USUARIO_SEM_IDENTIDADE.id)).toBe(true);
    expect(obterPapel).not.toHaveBeenCalled();
  });

  it('não estende a liberação a outro usuário comum', async () => {
    expect(await podeGerenciarEstoque(OUTRO_USUARIO)).toBe(false);
  });

  it('mantém admin permitido', async () => {
    obterPapel.mockResolvedValueOnce('admin');
    expect(await podeGerenciarEstoque(OUTRO_USUARIO)).toBe(true);
  });
});
