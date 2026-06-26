import type {
  LeituraPluviometrica,
  UpsertLeituraPluviometrica,
} from '@/domain/monitor/leitura-pluviometrica';

/**
 * Port do repositório de leituras pluviométricas (módulo Monitor, fase B1.1).
 *
 * Contrato enxuto: só o que o painel (B2/B3) e o sync (B1.2) vão consumir. O
 * adapter PG persiste em `leituras_pluviometricas` (migration 0046); o adapter
 * mock guarda em memória para o modo demo.
 */
export interface LeiturasPluviometricasRepository {
  /**
   * Lista as leituras de uma estação no período [desde, ate], ambos
   * inclusivos. Ordena por `momento` crescente. Retorna `[]` quando não há
   * leitura na janela.
   */
  listarPorEstacaoEPeriodo(
    estacaoId: string,
    desde: Date,
    ate: Date,
  ): Promise<LeituraPluviometrica[]>;

  /**
   * Upsert idempotente de um lote de leituras (ON CONFLICT (estacao_id,
   * momento) DO UPDATE). Permite ao sync reprocessar a mesma janela sem
   * duplicar a série (retry seguro). Atômico: tudo ou nada. Retorna a
   * quantidade de leituras inseridas ou atualizadas.
   */
  upsertLote(leituras: UpsertLeituraPluviometrica[]): Promise<number>;
}
