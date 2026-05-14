import 'server-only';
import type { PapeisRepository } from '@/application/ports/papeis-repository';
import { FalhaRepositorio } from '@/domain/errors';
import { sql } from './client';

export const papeisRepository: PapeisRepository = {
  async ehAprovador(usuarioId) {
    try {
      const linhas = await sql<{ eh: boolean }[]>`
        SELECT eh_aprovador(${usuarioId}::uuid) AS eh
      `;
      return linhas[0]?.eh === true;
    } catch (e) {
      throw new FalhaRepositorio('papeis.ehAprovador', e);
    }
  },
};
