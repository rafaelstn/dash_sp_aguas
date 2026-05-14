import type { TriagemRepository } from '@/application/ports/triagem-repository';
import type { PapeisRepository } from '@/application/ports/papeis-repository';
import type { FichaTriagem } from '@/domain/triagem';
import {
  AprovadorSemMFA,
  EstadoTriagemInvalido,
  FichaTriagemNaoEncontrada,
  LockRevisaoNegado,
  UsuarioNaoEhAprovador,
} from '@/domain/errors';
import { mfaObrigatorio } from '@/infrastructure/auth/mfa-config';

export interface ResultadoIniciarRevisaoUseCase {
  ficha: FichaTriagem;
  expiraEm: Date;
}

/**
 * Adquire lock pessimista de revisão. Camadas de defesa:
 *   1) Usuário tem papel `aprovador`.
 *   2) Usuário tem MFA verificado (defesa em profundidade — runtime check além
 *      do trigger SQL da migration 0023).
 *   3) Estado da ficha é `pendente`.
 *   4) Lock atomicamente adquirido via UNIQUE em triagem_locks.
 */
export async function iniciarRevisao(
  repo: TriagemRepository,
  papeis: PapeisRepository,
  triagemId: string,
  aprovadorId: string,
  metadata: { ip: string | null; userAgent: string | null },
): Promise<ResultadoIniciarRevisaoUseCase> {
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

  const resultado = await repo.iniciarRevisao(triagemId, aprovadorId, metadata);

  if (resultado.adquirido) {
    return { ficha: resultado.ficha, expiraEm: resultado.expiraEm };
  }

  if (resultado.motivo === 'lock_em_uso') {
    throw new LockRevisaoNegado(triagemId, 'ja_existe_lock');
  }
  // estado_invalido — pode ser que a ficha esteja em estado terminal ou já em revisão.
  // Diferenciamos "ficha não encontrada" via passo extra:
  const ficha = await repo.obterPorId(triagemId);
  if (!ficha) {
    throw new FichaTriagemNaoEncontrada(triagemId);
  }
  throw new EstadoTriagemInvalido(ficha.estado, 'em_revisao');
}
