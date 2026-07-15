import type { EstoqueConferenciasRepository } from '@/application/ports/estoque-conferencias-repository';
import type { Conferencia, NaturezaConferida } from '@/domain/estoque/conferencia';
import type { UnidadeFisica } from '@/domain/estoque/local';

/**
 * Entrada (ja validada em forma pelo zod da rota) de abrir conferencia.
 * `criadaPor` vem SEMPRE do auth do backend (nunca do corpo): trilha fiel (governo).
 */
export interface EntradaAbrirConferencia {
  unidade: UnidadeFisica;
  natureza: NaturezaConferida;
  localId?: string | null;
  observacao?: string | null;
}

/**
 * Abre uma sessao de conferencia + o SNAPSHOT congelado do escopo. A
 * materializacao do esperado (INSERT ... SELECT numa transacao) e a guarda de
 * "1 sessao aberta por escopo" (`EscopoConferenciaEmAberto`) sao do repositorio.
 * Testavel por injecao do `repo`.
 */
export async function abrirConferencia(
  repo: EstoqueConferenciasRepository,
  entrada: EntradaAbrirConferencia,
  usuarioId: string,
): Promise<Conferencia> {
  return repo.abrir({
    unidade: entrada.unidade,
    natureza: entrada.natureza,
    localId: entrada.localId ?? null,
    observacao: entrada.observacao ?? null,
    criadaPor: usuarioId,
  });
}
