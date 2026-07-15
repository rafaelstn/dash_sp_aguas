import type {
  FiltrosUnidade,
  Unidade,
  UpsertUnidade,
} from '@/domain/estoque/unidade';

/**
 * Port do repositorio de unidades serializadas. Adapter `.pg` persiste em
 * `estoque_unidades` (migration 0057); adapter `.mock` guarda em memoria (demo).
 * A MUTACAO de local/status via movimentacao NAO passa por aqui: e feita
 * atomicamente no `estoque-movimentacoes-repository` (ledger + unidade juntos).
 */
export interface EstoqueUnidadesRepository {
  listar(filtros: FiltrosUnidade): Promise<{ itens: Unidade[]; total: number }>;
  obterPorId(id: string): Promise<Unidade | null>;
  criar(dados: UpsertUnidade): Promise<Unidade>;
  /** Edita atributos (nao mexe em local/status por fluxo de movimentacao). */
  atualizar(id: string, dados: Partial<UpsertUnidade>): Promise<Unidade>;
  /** True se a unidade ja possui movimentacao no ledger. */
  possuiMovimentacao(id: string): Promise<boolean>;
  /** Hard-delete (so sem movimentacao); lanca `UnidadeNaoEncontrada` se nao existir. */
  remover(id: string): Promise<void>;
}
