import type {
  FiltrosListarPendentes,
  TriagemRepository,
} from '@/application/ports/triagem-repository';
import type { PapeisRepository } from '@/application/ports/papeis-repository';
import type { FichaTriagem } from '@/domain/triagem';
import { UsuarioNaoEhAprovador } from '@/domain/errors';
import { logger } from '@/infrastructure/logging/logger';

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
 * não decide HTTP — devolve ficha ou null. A camada de apresentação faz 404
 * (não 403) para não revelar a existência da ficha (anti-oracle / anti-IDOR).
 *
 * Defesa em profundidade:
 *   1) Se a ficha não existe → null.
 *   2) Se o usuário é o técnico dono → libera.
 *   3) Se o usuário é aprovador → libera.
 *   4) Caso contrário → null (camada HTTP devolve 404).
 *
 * Tentativa de leitura cruzada (não-dono, não-aprovador, ficha existe) é
 * logada como evento de segurança para correlação posterior — sem expor
 * detalhes ao chamador.
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
  // Log estruturado (severidade `security`) para SIEM detectar varredura
  // de IDs — alerta A1 em `docs/runbooks/alertas-siem.md`.
  logger.security(
    'seg.triagem.idor_blocked',
    {
      triagemId,
      usuarioId,
      donoId: ficha.tecnicoId,
      estado: ficha.estado,
    },
    'Tentativa de leitura cruzada bloqueada',
  );
  return null;
}
