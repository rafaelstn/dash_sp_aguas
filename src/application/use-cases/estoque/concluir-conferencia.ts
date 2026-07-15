import type { EstoqueConferenciasRepository } from '@/application/ports/estoque-conferencias-repository';
import type { Conferencia } from '@/domain/estoque/conferencia';

export type AcaoConferencia = 'concluir' | 'cancelar';

/**
 * Conclui ou cancela a sessao (aberta -> concluida|cancelada). Concluir apenas
 * congela a contagem e passa a listar as divergencias como pendentes de
 * reconciliacao; NAO toca o estoque (isso e a reconciliacao, por item). Cancelar
 * descarta a sessao sem efeito no estoque. `usuarioId` = auth do backend.
 */
export async function concluirConferencia(
  repo: EstoqueConferenciasRepository,
  conferenciaId: string,
  acao: AcaoConferencia,
  usuarioId: string,
  observacao?: string | null,
): Promise<Conferencia> {
  if (acao === 'concluir') {
    return repo.concluir(conferenciaId, usuarioId, observacao ?? null);
  }
  return repo.cancelar(conferenciaId, usuarioId, observacao ?? null);
}
