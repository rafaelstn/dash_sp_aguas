import 'server-only';

import type {
  NovoUsuario,
  UsuarioGerenciado,
  UsuariosAdminRepository,
} from '@/application/ports/usuarios-admin-repository';
import { type Papel, ehPapelValido, PAPEL_PADRAO } from '@/domain/auth/papel';
import { EmailJaCadastrado, FalhaRepositorio } from '@/domain/errors';
import { supabaseAdmin } from '@/infrastructure/auth/supabase-admin';
import { sql } from './client';

/**
 * Gestão de usuários sobre Supabase Auth Admin + Postgres.
 *
 *   - Leitura (listar / contar): SQL direto em `auth.users` LEFT JOIN
 *     `usuarios_papeis`. O nome vem de `raw_user_meta_data->>'nome'`; o papel
 *     cai no default `user` quando não há linha. Consultas parametrizadas.
 *   - Escrita de conta (criar/remover/senha): API Auth Admin (service role).
 *   - Escrita de papel: upsert em `usuarios_papeis`.
 *
 * NUNCA logar nem propagar a senha: os erros aqui só carregam operação +
 * causa (que é erro do Supabase/PG, sem o payload de senha).
 */

interface LinhaUsuario {
  id: string;
  email: string | null;
  nome: string | null;
  papel: string | null;
  criado_em: Date;
}

function mapearPapel(valor: string | null): Papel {
  return ehPapelValido(valor) ? valor : PAPEL_PADRAO;
}

export const usuariosAdminRepository: UsuariosAdminRepository = {
  async listar() {
    try {
      const linhas = await sql<LinhaUsuario[]>`
        SELECT
          u.id::text                         AS id,
          u.email                            AS email,
          u.raw_user_meta_data->>'nome'      AS nome,
          p.papel                            AS papel,
          u.created_at                       AS criado_em
        FROM auth.users u
        LEFT JOIN usuarios_papeis p ON p.usuario_id = u.id
        ORDER BY u.email ASC
      `;
      return linhas.map<UsuarioGerenciado>((l) => ({
        id: l.id,
        email: l.email ?? '',
        nome: l.nome && l.nome.trim().length > 0 ? l.nome.trim() : null,
        papel: mapearPapel(l.papel),
        criadoEm: new Date(l.criado_em),
      }));
    } catch (e) {
      throw new FalhaRepositorio('usuariosAdmin.listar', e);
    }
  },

  async existe(usuarioId: string) {
    try {
      const linhas = await sql<{ um: number }[]>`
        SELECT 1 AS um FROM auth.users WHERE id = ${usuarioId}::uuid LIMIT 1
      `;
      return linhas.length > 0;
    } catch (e) {
      throw new FalhaRepositorio('usuariosAdmin.existe', e);
    }
  },

  async criar(dados: NovoUsuario) {
    // 1. Cria a conta no Auth com email já confirmado (criação administrativa,
    //    não self-signup). O nome vai pro user_metadata, igual ao cadastro.
    const { data, error } = await supabaseAdmin().auth.admin.createUser({
      email: dados.email.toLowerCase(),
      password: dados.senha,
      email_confirm: true,
      user_metadata: { nome: dados.nome },
    });
    if (error || !data.user) {
      // E-mail já cadastrado: erro de conflito de negócio (vira 409), não 500.
      // O message do Supabase não inclui a senha; seguro inspecionar.
      const msg = (error?.message ?? '').toLowerCase();
      if (msg.includes('already') || msg.includes('exist') || msg.includes('registered')) {
        throw new EmailJaCadastrado(dados.email);
      }
      // error.message do Supabase não inclui a senha; seguro repassar.
      throw new FalhaRepositorio('usuariosAdmin.criar', error ?? 'sem usuário retornado');
    }
    const usuarioId = data.user.id;

    // 2. Grava o papel. Se falhar, desfaz a conta órfã (sem papel) pra não
    //    deixar usuário inconsistente — não há transação cross-sistema
    //    (Auth + PG), então compensamos manualmente.
    try {
      await this.definirPapel(usuarioId, dados.papel);
    } catch (e) {
      try {
        await supabaseAdmin().auth.admin.deleteUser(usuarioId);
      } catch {
        // Falha na compensação: o erro original ainda é o relevante. A conta
        // órfã fica como 'user' (default da coluna ao criar linha futura).
      }
      throw new FalhaRepositorio('usuariosAdmin.criar.papel', e);
    }

    return usuarioId;
  },

  async definirPapel(usuarioId: string, papel: Papel) {
    try {
      await sql`
        INSERT INTO usuarios_papeis (usuario_id, papel)
        VALUES (${usuarioId}::uuid, ${papel})
        ON CONFLICT (usuario_id) DO UPDATE SET papel = EXCLUDED.papel
      `;
    } catch (e) {
      throw new FalhaRepositorio('usuariosAdmin.definirPapel', e);
    }
  },

  async resetarSenha(usuarioId: string, novaSenha: string) {
    const { error } = await supabaseAdmin().auth.admin.updateUserById(usuarioId, {
      password: novaSenha,
    });
    if (error) {
      throw new FalhaRepositorio('usuariosAdmin.resetarSenha', error);
    }
  },

  async remover(usuarioId: string) {
    const { error } = await supabaseAdmin().auth.admin.deleteUser(usuarioId);
    if (error) {
      throw new FalhaRepositorio('usuariosAdmin.remover', error);
    }
  },

  async contarSuperAdmins() {
    try {
      const linhas = await sql<{ total: string }[]>`
        SELECT COUNT(*)::text AS total
        FROM usuarios_papeis
        WHERE papel = 'super_admin'
      `;
      return Number(linhas[0]?.total ?? '0');
    } catch (e) {
      throw new FalhaRepositorio('usuariosAdmin.contarSuperAdmins', e);
    }
  },
};
