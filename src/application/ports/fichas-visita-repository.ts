import type { FichaVisita } from '@/domain/ficha-visita';
import type { CodigoTipoDocumento } from '@/domain/tipo-documento';

/**
 * Dados para criar uma ficha. `id`, `criadaEm`, `atualizadaEm` são gerados
 * pelo banco. `origem` e `status` têm defaults — passa explícito só se
 * precisar sobrescrever (ex: import em massa com `origem: 'importacao'`).
 */
export type EntradaCriarFicha = Omit<
  FichaVisita,
  'id' | 'criadaEm' | 'atualizadaEm' | 'origem' | 'status'
> & {
  origem?: FichaVisita['origem'];
  status?: FichaVisita['status'];
};

/**
 * Dados para atualizar parcialmente. Só os campos enviados são alterados.
 * `prefixo` e `codTipoDocumento` não são alteráveis — uma ficha não muda
 * de posto nem de tipo (criar nova faz mais sentido que migrar).
 */
export type EntradaAtualizarFicha = Partial<
  Omit<
    FichaVisita,
    'id' | 'prefixo' | 'codTipoDocumento' | 'criadaEm' | 'atualizadaEm'
  >
>;

export interface FichasVisitaRepository {
  listarPorPosto(prefixo: string): Promise<FichaVisita[]>;
  listarPorPostoETipo(
    prefixo: string,
    codigo: CodigoTipoDocumento,
  ): Promise<FichaVisita[]>;
  obterPorId(id: string): Promise<FichaVisita | null>;
  criar(entrada: EntradaCriarFicha): Promise<FichaVisita>;
  atualizar(id: string, entrada: EntradaAtualizarFicha): Promise<FichaVisita>;
  apagar(id: string): Promise<void>;
}
