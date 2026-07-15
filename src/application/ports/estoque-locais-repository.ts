import type {
  EntradaLocal,
  Local,
  LocalNormalizado,
  UnidadeFisica,
} from '@/domain/estoque/local';

/**
 * Port do repositorio de locais do estoque. Adapter `.pg` persiste em
 * `estoque_locais` (migration 0054); adapter `.mock` guarda em memoria (demo).
 */
export interface EstoqueLocaisRepository {
  listar(filtros?: { unidade?: UnidadeFisica }): Promise<Local[]>;
  obterPorId(id: string): Promise<Local | null>;
  criar(dados: EntradaLocal): Promise<Local>;
  /** Atualiza; lanca `LocalNaoEncontrado` se o id nao existir. */
  atualizar(id: string, dados: Partial<EntradaLocal>): Promise<Local>;
  /** Remove; lanca `LocalEmUso` se houver saldo/unidade/movimentacao apontando. */
  remover(id: string): Promise<void>;
  /**
   * Get-or-create pela chave natural normalizada (unidade + sala + prateleira +
   * armario). Nao duplica local entre linhas nem entre reexecucoes do import.
   */
  obterOuCriar(normalizado: LocalNormalizado): Promise<Local>;
}
