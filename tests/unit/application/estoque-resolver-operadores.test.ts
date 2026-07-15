import { describe, expect, it } from 'vitest';
import { resolverOperadores } from '@/application/use-cases/estoque/resolver-operadores';
import { UUID_SISTEMA_IMPORT } from '@/domain/estoque/export';
import type { UsuariosIdentidadeRepository } from '@/application/ports/usuarios-identidade-repository';
import type { IdentidadeUsuario } from '@/domain/estoque/export';

/** Repo fake que resolve a partir de um mapa fixo (registra os ids recebidos). */
function repoFake(
  mapa: Map<string, IdentidadeUsuario>,
  recebidos: string[][] = [],
): UsuariosIdentidadeRepository {
  return {
    async resolver(ids) {
      recebidos.push(ids);
      return new Map(ids.filter((id) => mapa.has(id)).map((id) => [id, mapa.get(id)!]));
    },
  };
}

/** Repo fake que sempre falha (indisponibilidade da fonte de identidade). */
const repoQueFalha: UsuariosIdentidadeRepository = {
  async resolver() {
    throw new Error('auth.users indisponivel');
  },
};

describe('estoque/resolverOperadores (batch + degradacao segura)', () => {
  it('resolve ids distintos e NAO marca degradado no caminho feliz', async () => {
    const recebidos: string[][] = [];
    const repo = repoFake(
      new Map([
        ['u1', { nome: 'Maria Silva', email: 'maria@sp.gov.br' }],
        ['u2', { nome: null, email: 'joao@sp.gov.br' }],
      ]),
      recebidos,
    );

    const { operadores, degradado } = await resolverOperadores(repo, ['u1', 'u2', 'u1']);

    expect(degradado).toBe(false);
    expect(operadores.get('u1')).toBe('Maria Silva');
    expect(operadores.get('u2')).toBe('joao@sp.gov.br');
    // Batch: um unico resolver, com os ids DISTINTOS (u1 nao repetido).
    expect(recebidos).toEqual([['u1', 'u2']]);
  });

  it('degrada para o id cru e marca degradado quando o resolver falha', async () => {
    const { operadores, degradado } = await resolverOperadores(repoQueFalha, ['u1', 'u2']);

    expect(degradado).toBe(true);
    expect(operadores.get('u1')).toBe('u1');
    expect(operadores.get('u2')).toBe('u2');
  });

  it('UUID de import vira "Importação" mesmo com o resolver falhando', async () => {
    const { operadores, degradado } = await resolverOperadores(repoQueFalha, [UUID_SISTEMA_IMPORT]);

    expect(degradado).toBe(true);
    expect(operadores.get(UUID_SISTEMA_IMPORT)).toBe('Importação');
  });

  it('lista vazia: mapa vazio, sem degradar', async () => {
    const { operadores, degradado } = await resolverOperadores(repoFake(new Map()), []);

    expect(degradado).toBe(false);
    expect(operadores.size).toBe(0);
  });
});
