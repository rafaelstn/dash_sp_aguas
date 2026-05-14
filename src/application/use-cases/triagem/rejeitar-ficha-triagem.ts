import type { TriagemRepository } from '@/application/ports/triagem-repository';
import type { PapeisRepository } from '@/application/ports/papeis-repository';
import type { FichaTriagem } from '@/domain/triagem';
import { MotivoDecisao, MotivoDecisaoInsuficienteError } from '@/domain/triagem';
import {
  AprovadorSemMFA,
  MotivoRejeicaoInsuficiente,
  UsuarioNaoEhAprovador,
} from '@/domain/errors';
import { mfaObrigatorio } from '@/infrastructure/auth/mfa-config';

/**
 * Rejeição final — ciclo encerrado. Motivo ≥ 20 chars (validado por VO
 * `MotivoDecisao` + CHECK constraint na migration). Lança erros tipados
 * que a camada de apresentação traduz pra HTTP.
 */
export async function rejeitarFichaTriagem(
  repo: TriagemRepository,
  papeis: PapeisRepository,
  triagemId: string,
  aprovadorId: string,
  motivoBruto: string,
  metadata: { ip: string | null; userAgent: string | null },
): Promise<FichaTriagem> {
  const ehAprovador = await papeis.ehAprovador(aprovadorId);
  if (!ehAprovador) {
    throw new UsuarioNaoEhAprovador(aprovadorId);
  }
  if (mfaObrigatorio()) {
    const temMFA = await papeis.temMFAVerificado(aprovadorId);
    if (!temMFA) {
      throw new AprovadorSemMFA(aprovadorId);
    }
  }

  let motivo: MotivoDecisao;
  try {
    motivo = MotivoDecisao.criar(motivoBruto);
  } catch (e) {
    if (e instanceof MotivoDecisaoInsuficienteError) {
      throw new MotivoRejeicaoInsuficiente(e.tamanhoRecebido);
    }
    throw e;
  }

  return repo.rejeitar(triagemId, aprovadorId, motivo.valor, metadata);
}
