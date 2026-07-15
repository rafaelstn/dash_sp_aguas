import { redirect } from 'next/navigation';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import { papeisRepository } from '@/infrastructure/repositories';
import { ehAdmin } from '@/domain/auth/papel';
import { ConferenciaLista } from '@/components/features/estoque/conferencia/ConferenciaLista';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Conferências de estoque — SP Águas - DMO',
};

/**
 * Lista de conferencias fisicas (inventario) do Estoque. Sub-secao do modulo:
 * pagina server fina que resolve o papel do ator e propaga `podeGerenciar` ao
 * componente cliente, que esconde as acoes de escrita (abrir/concluir/etc.) para
 * quem so consulta. A autorizacao real e sempre reforcada no backend.
 */
export default async function PaginaConferencias() {
  const usuario = await obterUsuarioAtual();
  if (!usuario) {
    redirect('/login');
  }

  const papel = await papeisRepository.obterPapel(usuario.id);
  return <ConferenciaLista podeGerenciar={ehAdmin(papel)} />;
}
