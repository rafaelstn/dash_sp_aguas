import type {
  EstacaoPluviometrica,
  FiltrosEstacaoPluviometrica,
  UpsertEstacaoPluviometrica,
} from '@/domain/monitor/estacao-pluviometrica';

/**
 * Port do repositório de estações pluviométricas (módulo Monitor, fase B1.1).
 *
 * Contrato enxuto: só o que o painel (B2/B3) e o sync (B1.2) vão consumir. O
 * adapter PG persiste em `estacoes_pluviometricas` (migration 0045); o adapter
 * mock guarda em memória para o modo demo.
 */
export interface EstacoesPluviometricasRepository {
  /**
   * Lista estações, opcionalmente filtradas por bacia e/ou tipo. Ordena por
   * nome. Sem filtro, retorna todas.
   */
  listar(filtros?: FiltrosEstacaoPluviometrica): Promise<EstacaoPluviometrica[]>;

  /** Busca uma estação pelo `id`. Retorna `null` quando não existe. */
  obterPorId(id: string): Promise<EstacaoPluviometrica | null>;

  /**
   * Upsert idempotente por `sibhId` (chave natural/estável do SIBH). Insere se
   * o sibh_id é novo, atualiza os demais campos (inclusive `prefixo`) se já
   * existe (ON CONFLICT no índice único parcial de `sibh_id`, migration 0052).
   * Pensado para o sync reprocessar lotes sem duplicar estação, e para que o
   * mesmo prefixo coexista em tipos hidrológicos diferentes. Retorna a estação
   * resultante.
   */
  upsertPorSibhId(estacao: UpsertEstacaoPluviometrica): Promise<EstacaoPluviometrica>;
}
