import 'server-only';
import { NextResponse } from 'next/server';
import { obterUsuarioAtual, type UsuarioAutenticado } from '@/infrastructure/auth/current-user';
import { papeisRepository } from '@/infrastructure/repositories';
import { ehAdmin, ehSuperAdmin } from '@/domain/auth/papel';
import { podeGerenciarEstoque } from '@/infrastructure/auth/permissao-estoque';
import {
  USUARIO_SEM_IDENTIDADE,
  acessoSemIdentidadeAtivo,
} from '@/infrastructure/auth/acesso-sem-identidade';

/**
 * Helper de autorização compartilhado entre rotas API que não estão
 * cobertas pelo helper específico da triagem.
 *
 * Padrão de uso:
 *   const auth = await exigirUsuario();
 *   if (auth instanceof NextResponse) return auth;
 *   const usuario = auth;
 *
 * Falha gera resposta 401 com body { erro, mensagem }, mesmo formato
 * usado pelo helper da triagem (api/triagem/_helpers.ts).
 */
export async function exigirUsuario(): Promise<UsuarioAutenticado | NextResponse> {
  const usuario = await obterUsuarioAtual();
  if (!usuario) {
    return NextResponse.json(
      { erro: 'nao_autenticado', mensagem: 'Autenticação obrigatória.' },
      { status: 401 },
    );
  }
  return usuario;
}

/**
 * Exige que o usuário autenticado seja aprovador (admin ou super_admin).
 * Retorna 401 se não houver sessão e 403 se a sessão existir mas faltar o papel.
 * Mantido por compatibilidade com as rotas de triagem; equivale a `exigirAdmin`.
 */
export async function exigirAprovador(): Promise<UsuarioAutenticado | NextResponse> {
  const auth = await exigirUsuario();
  if (auth instanceof NextResponse) return auth;
  const ok = await papeisRepository.ehAprovador(auth.id);
  if (!ok) {
    return NextResponse.json(
      { erro: 'sem_papel_aprovador', mensagem: 'Operação requer papel de aprovador.' },
      { status: 403 },
    );
  }
  return auth;
}

/**
 * Exige papel de Admin ou Super Admin (equipe operacional). Mesmo critério de
 * `exigirAprovador`, com nome alinhado ao RBAC nomeado. Use em rotas de
 * operação privilegiada e de gestão de usuários comuns.
 */
export async function exigirAdmin(): Promise<UsuarioAutenticado | NextResponse> {
  const auth = await exigirUsuario();
  if (auth instanceof NextResponse) return auth;
  const papel = await papeisRepository.obterPapel(auth.id);
  if (!ehAdmin(papel)) {
    return NextResponse.json(
      { erro: 'sem_papel_admin', mensagem: 'Operação requer papel de Admin.' },
      { status: 403 },
    );
  }
  return auth;
}

/**
 * Exige permissão de escrita no módulo de estoque. Critério em
 * `podeGerenciarEstoque`: Admin, ou o usuário institucional da janela sem
 * identidade. Use SÓ em rotas de `/api/estoque`.
 */
export async function exigirGestorEstoque(): Promise<UsuarioAutenticado | NextResponse> {
  const auth = await exigirUsuario();
  if (auth instanceof NextResponse) return auth;
  if (!(await podeGerenciarEstoque(auth.id))) {
    return NextResponse.json(
      { erro: 'sem_papel_admin', mensagem: 'Operação requer papel de Admin.' },
      { status: 403 },
    );
  }
  return auth;
}

/**
 * Exige uma pessoa identificada. Com autenticação ligada equivale a
 * `exigirUsuario`. Na janela sem identidade (ADR-0024), ou para o id do usuário
 * institucional em qualquer modo, responde 403.
 *
 * Use em escrita que o produto apresenta como ato de alguém (por exemplo,
 * "revisado"), que a janela gravaria sem autor e que sobrescreve a autoria de
 * quem já tinha feito o registro com login.
 */
export async function exigirIdentidadeVerificada(): Promise<UsuarioAutenticado | NextResponse> {
  const auth = await exigirUsuario();
  if (auth instanceof NextResponse) return auth;
  // OU, e não E: o id institucional nunca é uma pessoa, com ou sem a janela.
  if (acessoSemIdentidadeAtivo() || auth.id === USUARIO_SEM_IDENTIDADE.id) {
    return NextResponse.json(
      {
        erro: 'identificacao_obrigatoria',
        mensagem: 'Esta operação exige usuário identificado e está indisponível no acesso sem identificação.',
      },
      { status: 403 },
    );
  }
  return auth;
}

/**
 * Exige papel de Super Admin (gestão de Admins e de papéis). Retorna 401 sem
 * sessão e 403 se faltar o papel.
 */
export async function exigirSuperAdmin(): Promise<UsuarioAutenticado | NextResponse> {
  const auth = await exigirUsuario();
  if (auth instanceof NextResponse) return auth;
  const papel = await papeisRepository.obterPapel(auth.id);
  if (!ehSuperAdmin(papel)) {
    return NextResponse.json(
      { erro: 'sem_papel_super_admin', mensagem: 'Operação requer papel de Super Admin.' },
      { status: 403 },
    );
  }
  return auth;
}

/**
 * Autoriza ação sobre recurso de propriedade de um técnico. Permite quando
 * o usuário é o próprio dono OU tem papel de aprovador. Retorna 403 caso
 * contrário, com o mesmo body usado em outras rotas privilegiadas.
 *
 * Use depois de exigirUsuario(): você já tem o usuário, esta função só
 * decide se ele pode mexer no recurso.
 */
export async function permitirDonoOuAprovador(
  usuario: UsuarioAutenticado,
  tecnicoId: string | null,
): Promise<true | NextResponse> {
  if (tecnicoId && tecnicoId === usuario.id) return true;
  const aprovador = await papeisRepository.ehAprovador(usuario.id);
  if (aprovador) return true;
  return NextResponse.json(
    { erro: 'sem_permissao', mensagem: 'Apenas o autor do registro ou um aprovador pode realizar esta operação.' },
    { status: 403 },
  );
}
