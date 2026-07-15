import { redirect } from 'next/navigation';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import { papeisRepository } from '@/infrastructure/repositories';
import { ehAdmin } from '@/domain/auth/papel';
import { ConferenciaDetalhe } from '@/components/features/estoque/conferencia/ConferenciaDetalhe';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Conferência de estoque — SP Águas - DMO',
};

/**
 * Detalhe de uma conferencia fisica: cabecalho, resumo, contagem (sessao aberta)
 * ou divergencias/reconciliacao (sessao concluida). Pagina server fina: resolve o
 * papel do ator e propaga `podeGerenciar` ao detalhe cliente, que busca os dados
 * via API. A autorizacao real e sempre reforcada no backend.
 */
export default async function PaginaConferenciaDetalhe({
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
  return <ConferenciaDetalhe conferenciaId={id} podeGerenciar={ehAdmin(papel)} />;
}
