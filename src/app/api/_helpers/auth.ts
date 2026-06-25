import 'server-only';
import { NextResponse } from 'next/server';
import { obterUsuarioAtual, type UsuarioAutenticado } from '@/infrastructure/auth/current-user';
import { papeisRepository } from '@/infrastructure/repositories';

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
 * Exige que o usuário autenticado seja aprovador. Retorna 401 se não
 * houver sessão e 403 se a sessão existir mas faltar o papel.
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
