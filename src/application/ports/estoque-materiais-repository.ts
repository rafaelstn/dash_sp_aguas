import type {
  FiltrosMaterial,
  Material,
  UpsertMaterial,
} from '@/domain/estoque/material';

/**
 * Port do repositorio do catalogo de materiais. Adapter `.pg` persiste em
 * `estoque_materiais` (migration 0056); adapter `.mock` guarda em memoria (demo).
 */
export interface EstoqueMateriaisRepository {
  listar(filtros: FiltrosMaterial): Promise<{ itens: Material[]; total: number }>;
  obterPorId(id: string): Promise<Material | null>;
  criar(dados: UpsertMaterial): Promise<Material>;
  /** Atualiza; lanca `MaterialNaoEncontrado` se o id nao existir. */
  atualizar(id: string, dados: Partial<UpsertMaterial>): Promise<Material>;
  /** Soft-inativar (ativo=false); lanca `MaterialNaoEncontrado` se nao existir. */
  inativar(id: string): Promise<Material>;
  /** True se ha unidade/saldo/movimentacao referenciando o material. */
  possuiVinculos(id: string): Promise<boolean>;
  /** Hard-delete (so quando sem vinculos); lanca `MaterialNaoEncontrado` se nao existir. */
  remover(id: string): Promise<void>;
}
