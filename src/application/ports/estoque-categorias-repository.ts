import type { Categoria, UpsertCategoria } from '@/domain/estoque/categoria';

/**
 * Port do repositorio de categorias do estoque. Adapter `.pg` persiste em
 * `estoque_categorias` (migration 0055); adapter `.mock` guarda em memoria (demo).
 */
export interface EstoqueCategoriasRepository {
  listar(): Promise<Categoria[]>;
  obterPorId(id: string): Promise<Categoria | null>;
  criar(dados: UpsertCategoria): Promise<Categoria>;
  /** Atualiza; lanca `CategoriaNaoEncontrada` se o id nao existir. */
  atualizar(id: string, dados: Partial<UpsertCategoria>): Promise<Categoria>;
  /** Remove. O FK ON DELETE SET NULL desvincula os materiais (nao apaga). */
  remover(id: string): Promise<void>;
  /** Get-or-create por nome (case-insensitive), usado pelo import. */
  obterOuCriarPorNome(nome: string): Promise<Categoria>;
}
