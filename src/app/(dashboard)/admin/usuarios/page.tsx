import { redirect } from 'next/navigation';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import { papeisRepository } from '@/infrastructure/repositories';
import { ehAdmin } from '@/domain/auth/papel';
import { GestaoUsuarios } from '@/components/features/admin/GestaoUsuarios';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Usuários — SP Águas - DMO',
};

/**
 * Gestão de usuários (RBAC). Página server protegida: só Admin/Super Admin
 * acessam. Sem sessão vai para /login; com sessão mas sem papel suficiente
 * vai para a home (não revela a existência da tela).
 *
 * O componente client recebe o papel do ator e o id do ator (resolvidos no
 * servidor a partir da sessão) para espelhar as regras de privilégio na UI.
 * A autorização real é sempre reforçada no backend (rotas /api/admin/usuarios).
 */
export default async function PaginaGestaoUsuarios() {
  const usuario = await obterUsuarioAtual();
  if (!usuario) {
    redirect('/login');
  }

  const papelAtor = await papeisRepository.obterPapel(usuario.id);
  if (!ehAdmin(papelAtor)) {
    redirect('/');
  }

  return <GestaoUsuarios papelAtor={papelAtor} meuId={usuario.id} />;
}
