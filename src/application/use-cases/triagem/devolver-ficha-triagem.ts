import type { TriagemRepository } from '@/application/ports/triagem-repository';
import type { PapeisRepository } from '@/application/ports/papeis-repository';
import type { FichaTriagem } from '@/domain/triagem';
import { MotivoDecisao, MotivoDecisaoInsuficienteError } from '@/domain/triagem';
import {
  AprovadorSemMFA,
  MotivoRejeicaoInsuficiente,
  UsuarioNaoEhAprovador,
} from '@/domain/errors';

/**
 * Devolve ficha pro técnico com solicitação de correção.
 * Estado vai pra `devolvida` — técnico pode re-enviar (cria NOVA linha,
 * use case `reenviarFichaTriagem`).
 */
export async function devolverFichaTriagem(
  repo: TriagemRepository,
  papeis: PapeisRepository,
  triagemId: string,
  aprovadorId: string,
  solicitacaoBruta: string,
  metadata: { ip: string | null; userAgent: string | null },
): Promise<FichaTriagem> {
  const ehAprovador = await papeis.ehAprovador(aprovadorId);
  if (!ehAprovador) {
    throw new UsuarioNaoEhAprovador(aprovadorId);
  }
  const temMFA = await papeis.temMFAVerificado(aprovadorId);
  if (!temMFA) {
    throw new AprovadorSemMFA(aprovadorId);
  }

  let solicitacao: MotivoDecisao;
  try {
    solicitacao = MotivoDecisao.criar(solicitacaoBruta);
  } catch (e) {
    if (e instanceof MotivoDecisaoInsuficienteError) {
      throw new MotivoRejeicaoInsuficiente(e.tamanhoRecebido);
    }
    throw e;
  }

  return repo.devolver(triagemId, aprovadorId, solicitacao.valor, metadata);
}
