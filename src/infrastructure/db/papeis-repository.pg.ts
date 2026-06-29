import 'server-only';
import type { PapeisRepository } from '@/application/ports/papeis-repository';
import { type Papel, ehPapelValido, ehAdmin, PAPEL_PADRAO } from '@/domain/auth/papel';
import { FalhaRepositorio } from '@/domain/errors';
import { sql } from './client';

export const papeisRepository: PapeisRepository = {
  async obterPapel(usuarioId) {
    try {
      const linhas = await sql<{ papel: string }[]>`
        SELECT papel FROM usuarios_papeis WHERE usuario_id = ${usuarioId}::uuid LIMIT 1
      `;
      const papel = linhas[0]?.papel;
      // Default seguro (menor privilégio) quando não há linha ou valor inesperado.
      return ehPapelValido(papel) ? (papel as Papel) : PAPEL_PADRAO;
    } catch (e) {
      throw new FalhaRepositorio('papeis.obterPapel', e);
    }
  },

  async ehAprovador(usuarioId) {
    return ehAdmin(await this.obterPapel(usuarioId));
  },
};
