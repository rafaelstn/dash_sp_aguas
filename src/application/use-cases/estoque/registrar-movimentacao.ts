import type { EstoqueMovimentacoesRepository } from '@/application/ports/estoque-movimentacoes-repository';
import type {
  ComandoMovimentacao,
  ResultadoMovimentacao,
  TipoMovimentacao,
} from '@/domain/estoque/movimentacao';
import {
  resolverAlvo,
  validarComandoEstrutural,
} from '@/domain/estoque/movimentacao';
import type { Estado } from '@/domain/estoque/estado';
import type { Status } from '@/domain/estoque/status-unidade';

/**
 * Entrada (ja validada em forma pelo zod da rota) do caso de uso de registrar
 * movimentacao. `usuarioId` vem SEMPRE do auth do backend (nunca do corpo):
 * garante trilha de auditoria fiel (ADR 0020 §6).
 */
export interface EntradaRegistrarMovimentacao {
  tipo: TipoMovimentacao;
  unidadeId?: string | null;
  materialId?: string | null;
  /** Default 1 (serializado e sempre 1). */
  quantidade?: number;
  localOrigem?: string | null;
  localDestino?: string | null;
  tamanho?: string | null;
  motivo?: string | null;
  /** Ajuste serializado: novo estado (undefined = nao mexer). */
  estado?: Estado | null;
  /** Ajuste serializado: novo status (undefined = nao mexer). */
  status?: Status;
}

/**
 * Nucleo do modulo: registra uma movimentacao de estoque.
 *
 * Responsabilidade do caso de uso (puro, sem I/O de banco direto):
 *   1. Resolve o alvo (XOR unidade/material) — 400 se ambiguo.
 *   2. Valida as regras ESTRUTURAIS por tipo (locais, motivo, quantidade,
 *      ajuste so serializado) — 400 se violado.
 *   3. Monta o comando normalizado e delega ao repositorio a TRANSACAO atomica
 *      (ledger + saldo/unidade). As regras que dependem do estado no banco
 *      (transicao de status, saldo nao-negativo) sao validadas dentro da
 *      transacao pelo repositorio, race-safe.
 *
 * Testavel por injecao do `repo` (mock in-memory replica a mesma logica/erros).
 */
export async function registrarMovimentacao(
  repo: EstoqueMovimentacoesRepository,
  entrada: EntradaRegistrarMovimentacao,
  usuarioId: string,
): Promise<ResultadoMovimentacao> {
  const alvo = resolverAlvo({
    unidadeId: entrada.unidadeId,
    materialId: entrada.materialId,
  });

  const localOrigemId = entrada.localOrigem ?? null;
  const localDestinoId = entrada.localDestino ?? null;
  const motivo = entrada.motivo ?? null;
  const quantidade = entrada.quantidade ?? 1;

  validarComandoEstrutural({
    tipo: entrada.tipo,
    alvo,
    quantidade,
    localOrigemId,
    localDestinoId,
    tamanho: entrada.tamanho ?? null,
    motivo,
    novoEstado: entrada.estado,
    novoStatus: entrada.status,
  });

  const comando: ComandoMovimentacao = {
    tipo: entrada.tipo,
    alvo,
    quantidade,
    localOrigemId,
    localDestinoId,
    tamanho: entrada.tamanho ?? null,
    motivo,
    novoEstado: entrada.estado,
    novoStatus: entrada.status,
    usuarioId,
  };

  return repo.registrar(comando);
}
