import type { TriagemRepository } from '@/application/ports/triagem-repository';

/**
 * Use case do cron de liberação de locks. Idempotente — chamar 2x não
 * gera efeito extra além de logar.
 *
 * Implementação detalhada está no repo (precisa de transação SQL com
 * DELETE + UPDATE + INSERT em events). Aqui só delega.
 *
 * Autorização: feita na camada de apresentação via `x-cron-secret` header
 * (rota `/api/cron/liberar-locks-expirados`). Use case não conhece HTTP.
 */
export async function liberarLocksExpirados(
  repo: TriagemRepository,
): Promise<{ liberados: string[]; quantidade: number }> {
  const { liberados } = await repo.liberarLocksExpirados();
  return { liberados, quantidade: liberados.length };
}
