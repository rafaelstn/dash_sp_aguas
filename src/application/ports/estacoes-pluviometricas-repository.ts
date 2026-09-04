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
 *
 * Regra que este contrato passa a carregar com a migration 0067: **nenhum campo
 * daqui transporta identificador do banco do órgão.** O vínculo ao catálogo de
 * postos é o booleano `vinculadoAPosto` mais o `prefixo`, nunca o `Postos.Id`
 * do SQL Server. Persistir aquele id como chave estrangeira do nosso PostgreSQL
 * foi o que recusou 2.714 das 5.415 estações na sincronização de produção: o
 * ADR-0023 proíbe acoplamento entre os dois armazenamentos, e este era o ponto
 * onde ele entrava sem aparecer como `JOIN`.
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
