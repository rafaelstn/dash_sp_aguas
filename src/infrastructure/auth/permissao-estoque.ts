import 'server-only';
import { papeisRepository } from '@/infrastructure/repositories';
import { ehAdmin } from '@/domain/auth/papel';
import {
  USUARIO_SEM_IDENTIDADE,
  acessoSemIdentidadeAtivo,
} from '@/infrastructure/auth/acesso-sem-identidade';

/**
 * Quem pode ESCREVER no módulo de estoque (cadastro, movimentação, conferência,
 * desconformidades).
 *
 * Com autenticação ligada: Admin ou Super Admin, como antes.
 *
 * Na janela sem identidade (ADR-0024): o usuário institucional também pode,
 * por decisão do Rafael em 16/09/2026 ("como não temos login por enquanto deixa
 * sem operador"). A liberação vale SÓ para o estoque. O papel do usuário
 * institucional continua `user`, então triagem, fichas e gestão de usuários
 * seguem com 403, que é a contenção do ADR-0024 3.2. A trilha grava o UUID
 * institucional ("Acesso sem identificação"), sem inventar operador.
 *
 * Desligar a janela (`ACESSO_SEM_IDENTIDADE` diferente de `sim`) devolve o
 * critério de Admin sem mudar código.
 */
export async function podeGerenciarEstoque(usuarioId: string): Promise<boolean> {
  if (acessoSemIdentidadeAtivo() && usuarioId === USUARIO_SEM_IDENTIDADE.id) return true;
  return ehAdmin(await papeisRepository.obterPapel(usuarioId));
}
