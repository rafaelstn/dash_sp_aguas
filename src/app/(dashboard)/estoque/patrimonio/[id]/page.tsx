import { redirect } from 'next/navigation';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import { podeGerenciarEstoque } from '@/infrastructure/auth/permissao-estoque';
import { PatrimonioDetalhe } from '@/components/features/estoque/PatrimonioDetalhe';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Item de patrimônio — SP Águas - DMO',
};

/**
 * Pagina de detalhe de um item serializado (foi o alvo do QR da etiqueta, que
 * virou codigo de barras em 2026-09-16; hoje nenhuma tela linka para ca).
 * Dentro do route group `(dashboard)`, entao herda o chrome e a autenticacao:
 * quem abre sem sessao cai no login e volta para ca. Pagina server fina: resolve o papel do ator e propaga
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
  const podeGerenciar = await podeGerenciarEstoque(usuario.id);
  return <PatrimonioDetalhe id={id} podeGerenciar={podeGerenciar} />;
}
