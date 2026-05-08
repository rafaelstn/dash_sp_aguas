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
 *
 * Heartbeat: emitido SEMPRE após sucesso (mesmo com 0 liberações), pra
 * alimentar alerta A3 (ausência por >10min) em
 * `docs/runbooks/alertas-siem.md`. Falha do heartbeat não derruba o cron
 * — engolida pelo repo.
 */
export async function liberarLocksExpirados(
  repo: TriagemRepository,
): Promise<{ liberados: string[]; quantidade: number; duracaoMs: number }> {
  const inicio = Date.now();
  const { liberados } = await repo.liberarLocksExpirados();
  const duracaoMs = Date.now() - inicio;
  await repo.registrarHeartbeat('triagem-liberar-locks-expirados', duracaoMs, {
    quantidade: liberados.length,
  });
  return { liberados, quantidade: liberados.length, duracaoMs };
}
