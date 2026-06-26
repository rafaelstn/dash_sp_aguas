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
   * Upsert idempotente por `prefixo` (chave natural do SIBH). Insere se o
   * prefixo é novo, atualiza os demais campos se já existe (ON CONFLICT no
   * índice único parcial de `prefixo`). Pensado para o sync reprocessar lotes
   * sem duplicar estação. Retorna a estação resultante.
   */
  upsertPorPrefixo(estacao: UpsertEstacaoPluviometrica): Promise<EstacaoPluviometrica>;
}
