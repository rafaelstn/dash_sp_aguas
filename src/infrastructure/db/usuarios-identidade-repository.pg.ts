import 'server-only';
import type { UsuariosIdentidadeRepository } from '@/application/ports/usuarios-identidade-repository';
import { type IdentidadeUsuario, UUID_SISTEMA_IMPORT } from '@/domain/estoque/export';
import { FalhaRepositorio } from '@/domain/errors';
import { sql } from './client';

/**
 * Resolve id -> identidade em auth.users num unico SELECT (batch). O nome vem de
 * `raw_user_meta_data->>'nome'` e o email da coluna `email` — MESMA fonte da
 * gestao de usuarios (usuarios-admin-repository.supabase). Ids ausentes (o UUID
 * de sistema do import, ou contas removidas) simplesmente nao voltam no mapa; o
 * chamador decide o rotulo via `rotuloOperador`.
 */
export const usuariosIdentidadeRepository: UsuariosIdentidadeRepository = {
  async resolver(ids) {
    const mapa = new Map<string, IdentidadeUsuario>();
    // Deduplica e descarta o UUID de sistema (nao existe em auth.users).
    const unicos = [...new Set(ids)].filter((id) => id !== UUID_SISTEMA_IMPORT);
    if (unicos.length === 0) return mapa;
    try {
      const linhas = await sql<{ id: string; email: string | null; nome: string | null }[]>`
        SELECT u.id::text                   AS id,
               u.email                       AS email,
               u.raw_user_meta_data->>'nome' AS nome
          FROM auth.users u
         WHERE u.id = ANY(${unicos}::uuid[])
      `;
      for (const l of linhas) {
        mapa.set(l.id, { email: l.email, nome: l.nome });
      }
      return mapa;
    } catch (e) {
      throw new FalhaRepositorio('usuariosIdentidade.resolver', e);
    }
  },
};
