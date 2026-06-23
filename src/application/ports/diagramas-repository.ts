import type {
  Diagrama,
  DiagramaResumo,
  NovoDiagrama,
} from '@/domain/diagramas/diagrama';
import type { ElementoDiagrama } from '@/domain/diagramas/tipos';

/**
 * Porta de persistência dos diagramas unifilares. A lista nunca traz o JSONB
 * pesado de elementos; só `obter` carrega o diagrama completo.
 */
export interface DiagramasRepository {
  /** Lista resumida (sem elementos), mais recentes primeiro. */
  listar(): Promise<DiagramaResumo[]>;

  /** Diagrama completo (com elementos) ou null se não existir. */
  obter(id: string): Promise<Diagrama | null>;

  /** Cria um diagrama. `criadoPor` é o UUID do autor (ou null). */
  criar(dados: NovoDiagrama, criadoPor: string | null): Promise<Diagrama>;

  /** Renomeia. Lança DiagramaNaoEncontrado se o id não existir. */
  renomear(id: string, nome: string): Promise<void>;

  /**
   * Duplica um diagrama (nome + " (cópia)", mesmos elementos). Lança
   * DiagramaNaoEncontrado se a origem não existir.
   */
  duplicar(id: string, criadoPor: string | null): Promise<Diagrama>;

  /**
   * Substitui o array de elementos. Lança DiagramaNaoEncontrado se o id não
   * existir. O `atualizado_em` é tocado pela trigger.
   */
  salvarElementos(id: string, elementos: ElementoDiagrama[]): Promise<void>;

  /** Exclui. Lança DiagramaNaoEncontrado se o id não existir. */
  excluir(id: string): Promise<void>;
}
