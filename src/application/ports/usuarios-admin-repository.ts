import type { Papel } from '@/domain/auth/papel';

/**
 * Gestão administrativa de usuários (RBAC).
 *
 * Junta o Supabase Auth (criar/remover usuário, trocar senha) com a tabela
 * `usuarios_papeis` (papel). Implementação concreta usa a service role key
 * (server-only) — ver `infrastructure/db/usuarios-admin-repository.supabase.ts`.
 *
 * A autorização de quem-pode-mexer-em-quem NÃO mora aqui: é decidida pela
 * lógica pura `domain/auth/gestao-acesso.ts` e orquestrada nas rotas. Este
 * port é só a porta de I/O.
 */

/** Visão de um usuário para a tela de gestão. Sem dado sensível (sem senha). */
export interface UsuarioGerenciado {
  id: string;
  email: string;
  /** Nome de exibição (user_metadata.nome); null quando não preenchido. */
  nome: string | null;
  papel: Papel;
  /** Data de criação no Auth (created_at). */
  criadoEm: Date;
}

export interface NovoUsuario {
  email: string;
  senha: string;
  nome: string;
  papel: Papel;
}

export interface UsuariosAdminRepository {
  /** Lista todos os usuários (Auth + papel), ordenados por email. */
  listar(): Promise<UsuarioGerenciado[]>;

  /** True se existe conta no Auth com este id. Usado para responder 404. */
  existe(usuarioId: string): Promise<boolean>;

  /**
   * Cria o usuário no Auth (email já confirmado) e grava o papel.
   * Retorna o id do usuário criado.
   */
  criar(dados: NovoUsuario): Promise<string>;

  /** Define (upsert) o papel de um usuário existente. */
  definirPapel(usuarioId: string, papel: Papel): Promise<void>;

  /** Troca a senha de um usuário existente (Auth Admin). */
  resetarSenha(usuarioId: string, novaSenha: string): Promise<void>;

  /** Remove o usuário do Auth; o cascade limpa `usuarios_papeis`. */
  remover(usuarioId: string): Promise<void>;

  /** Quantidade de super_admins (para proteger o último). */
  contarSuperAdmins(): Promise<number>;
}
