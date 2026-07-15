import { redirect } from 'next/navigation';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import { papeisRepository } from '@/infrastructure/repositories';
import { ehAdmin } from '@/domain/auth/papel';
import { PainelEstoque } from '@/components/features/estoque/PainelEstoque';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Estoque — SP Águas - DMO',
};

/**
 * Modulo de Estoque (almoxarifado / patrimonio). Pagina server fina: resolve o
 * papel do ator a partir da sessao e propaga `podeGerenciar` ao painel cliente,
 * que esconde as acoes de escrita para quem so consulta (papel user). A
 * autorizacao real e sempre reforcada no backend (rotas /api/estoque/*).
 */
export default async function PaginaEstoque() {
  const usuario = await obterUsuarioAtual();
  if (!usuario) {
    redirect('/login');
  }

  const papel = await papeisRepository.obterPapel(usuario.id);
  return <PainelEstoque podeGerenciar={ehAdmin(papel)} />;
}
