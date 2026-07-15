import { redirect } from 'next/navigation';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import { papeisRepository } from '@/infrastructure/repositories';
import { ehAdmin } from '@/domain/auth/papel';
import { PatrimonioDetalhe } from '@/components/features/estoque/PatrimonioDetalhe';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Item de patrimônio — SP Águas - DMO',
};

/**
 * Pagina alvo do QR de patrimonio. Dentro do route group `(dashboard)`, entao
 * herda o chrome e a autenticacao: quem escaneia sem sessao cai no login e
 * volta para ca. Pagina server fina: resolve o papel do ator e propaga
 * `podeGerenciar` ao detalhe cliente, que busca o item e a trilha via API. A
 * autorizacao real e sempre reforcada no backend.
 */
export default async function PaginaPatrimonio({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const usuario = await obterUsuarioAtual();
  if (!usuario) {
    redirect('/login');
  }

  const { id } = await params;
  const papel = await papeisRepository.obterPapel(usuario.id);
  return <PatrimonioDetalhe id={id} podeGerenciar={ehAdmin(papel)} />;
}
