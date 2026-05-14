import type { TriagemRepository } from '@/application/ports/triagem-repository';
import type { PapeisRepository } from '@/application/ports/papeis-repository';
import type { FichaTriagem } from '@/domain/triagem';
import { UsuarioNaoEhAprovador } from '@/domain/errors';

export interface ResultadoAprovacaoUseCase {
  triagem: FichaTriagem;
  fichaVisitaId: string;
}

/**
 * Aprova ficha em revisão — promoção atômica para `fichas_visita`.
 *
 * Defesa em profundidade:
 *   1) Aprovador.
 *   2) Repo verifica dentro de sql.begin: estado='em_revisao' AND lock pertence ao aprovador.
 *   3) INSERT em fichas_visita + UPDATE triagem + DELETE lock + INSERT evento, tudo ou nada.
 *
 * Invariante: após sucesso, EXISTE linha em `fichas_visita` com `id = retorno.fichaVisitaId`
 * E `fichas_triagem.estado = 'aprovada'` E `fichas_triagem.ficha_visita_id = id`.
 *
 * Erros típicos:
 *   UsuarioNaoEhAprovador     → 403
 *   LockRevisaoNegado         → 423 (lock perdido, não é dono)
 *   EstadoTriagemInvalido     → 409 (não está em em_revisao)
 *   FichaTriagemNaoEncontrada → 404
 */
export async function aprovarFichaTriagem(
  repo: TriagemRepository,
  papeis: PapeisRepository,
  triagemId: string,
  aprovadorId: string,
  metadata: { ip: string | null; userAgent: string | null },
): Promise<ResultadoAprovacaoUseCase> {
  const ehAprovador = await papeis.ehAprovador(aprovadorId);
  if (!ehAprovador) {
    throw new UsuarioNaoEhAprovador(aprovadorId);
  }

  return repo.aprovar(triagemId, aprovadorId, metadata);
}
