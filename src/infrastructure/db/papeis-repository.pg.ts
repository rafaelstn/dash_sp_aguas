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

  async temMFAVerificado(usuarioId) {
    try {
      // auth.mfa_factors é gerenciado pelo Supabase. Em ambientes sem schema
      // (testes locais), retornar false e deixar a camada superior decidir.
      const linhas = await sql<{ qtd: string }[]>`
        SELECT COUNT(*)::text AS qtd
          FROM auth.mfa_factors
         WHERE user_id = ${usuarioId}::uuid
           AND status = 'verified'
      `;
      return Number(linhas[0]?.qtd ?? '0') > 0;
    } catch (e) {
      // Schema indisponível em dev — não bloqueia operação local com bypass.
      // Em produção, esse erro vira 500 indireto via FalhaRepositorio.
      throw new FalhaRepositorio('papeis.temMFAVerificado', e);
    }
  },
};
