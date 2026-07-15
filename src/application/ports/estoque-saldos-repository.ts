import type { FiltrosSaldo, Saldo, SaldoComContexto } from '@/domain/estoque/saldo';
import type { SaldoExport } from '@/domain/estoque/export';

/**
 * Port do repositorio de saldos de quantificaveis (SOMENTE LEITURA aqui). A
 * ESCRITA do saldo e feita exclusivamente dentro da transacao do
 * `estoque-movimentacoes-repository` (upsert / UPDATE guardado): concentrar a
 * escrita num unico lugar garante o invariante nao-negativo (ADR 0020).
 * Adapter `.pg` le de `estoque_saldos` (migration 0058); `.mock` le da memoria.
 */
export interface EstoqueSaldosRepository {
  /** Consulta saldo com contexto (descricao do material, rotulo/unidade do local). */
  listar(filtros: FiltrosSaldo): Promise<SaldoComContexto[]>;
  /**
   * Lista saldos para o export: uma linha por (material, local, tamanho), com
   * marca/modelo/categoria do material e unidade/rotulo do local. Mesmos filtros
   * de `listar`; teto defensivo TETO_EXPORT.
   */
  listarParaExport(filtros: FiltrosSaldo): Promise<SaldoExport[]>;
  obterPorMaterialLocal(
    materialId: string,
    localId: string,
    tamanho: string | null,
  ): Promise<Saldo | null>;
}
