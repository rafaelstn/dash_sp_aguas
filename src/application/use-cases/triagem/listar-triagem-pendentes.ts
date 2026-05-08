import type {
  FiltrosListarPendentes,
  TriagemRepository,
} from '@/application/ports/triagem-repository';
import type { PapeisRepository } from '@/application/ports/papeis-repository';
import type { FichaTriagem } from '@/domain/triagem';
import { UsuarioNaoEhAprovador } from '@/domain/errors';

/**
 * Lista fichas pendentes/em revisão pra o aprovador.
 * Default: estados `pendente` + `em_revisao`, ordenado por mais antigas primeiro
 * (delegado à query do repositório).
 *
 * Validação: usuário deve ser aprovador. MFA é checado separadamente nos use
 * cases de ação (não é necessário pra listar).
 */
export async function listarTriagemPendentes(
  repo: TriagemRepository,
  papeis: PapeisRepository,
  usuarioId: string,
  filtros: Omit<FiltrosListarPendentes, 'estado'> = {},
): Promise<{ itens: FichaTriagem[]; total: number }> {
  const ehAprovador = await papeis.ehAprovador(usuarioId);
  if (!ehAprovador) {
    throw new UsuarioNaoEhAprovador(usuarioId);
  }

  return repo.listarPendentes({
    ...filtros,
    estado: ['pendente', 'em_revisao'],
  });
}

/**
 * Aprovador pode ver qualquer ficha; técnico só vê as próprias. O use case
 * não decide HTTP — devolve ficha ou null. A camada de apresentação faz 404.
 */
export async function obterFichaTriagem(
  repo: TriagemRepository,
  papeis: PapeisRepository,
  triagemId: string,
  usuarioId: string,
): Promise<FichaTriagem | null> {
  const ficha = await repo.obterPorId(triagemId);
  if (!ficha) return null;
  if (ficha.tecnicoId === usuarioId) return ficha;
  const ehAprovador = await papeis.ehAprovador(usuarioId);
  if (ehAprovador) return ficha;
  // Não é dono e não é aprovador → trata como inexistente (evita oracle).
  return null;
}
